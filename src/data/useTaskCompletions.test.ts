import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { TaskCompletionRow } from '../lib/types';

/**
 * Mock the Supabase client. `from().select().eq()` resolves with whatever rows
 * are queued for the current user; `channel().on().subscribe()` captures the
 * reconcile callback so a test can drive INSERT/UPDATE/DELETE payloads.
 */
const { supabaseMock, state } = vi.hoisted(() => {
  const state = {
    rowsByUser: new Map<string, TaskCompletionRow[]>(),
    reconcile: null as
      | ((p: RealtimePostgresChangesPayload<TaskCompletionRow>) => void)
      | null,
    lastFilterUserId: null as string | null,
    removeChannelCalls: 0,
  };

  const query = {
    select() {
      return this;
    },
    eq(_col: string, uid: string) {
      state.lastFilterUserId = uid;
      return Promise.resolve({
        data: state.rowsByUser.get(uid) ?? [],
        error: null,
      });
    },
  };

  const channel = {
    on(
      _event: string,
      _opts: unknown,
      cb: (p: RealtimePostgresChangesPayload<TaskCompletionRow>) => void,
    ) {
      state.reconcile = cb;
      return this;
    },
    subscribe(cb?: (status: string) => void) {
      if (cb) cb('SUBSCRIBED');
      return this;
    },
  };

  const supabaseMock = {
    from: () => query,
    channel: () => channel,
    removeChannel: () => {
      state.removeChannelCalls += 1;
      return Promise.resolve('ok');
    },
  };

  return { supabaseMock, state };
});

vi.mock('../lib/supabase', () => ({
  supabase: supabaseMock,
  realtimeFallback: false,
}));

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock('../context/SessionProvider', () => ({
  useSession: () => useSessionMock(),
}));

import { useTaskCompletions } from './useTaskCompletions';

function sessionFor(userId: string | null) {
  return {
    session: userId ? { user: { id: userId, email: `${userId}@x.com` } } : null,
    profile: userId ? { id: userId, name: userId, email: '', role: 'member' } : null,
    role: userId ? 'member' : null,
    isOfficer: false,
    refreshProfile: vi.fn(),
  };
}

function row(userId: string, taskId: string): TaskCompletionRow {
  return { user_id: userId, task_id: taskId, completed_at: '2025-01-01T00:00:00Z' };
}

describe('useTaskCompletions', () => {
  beforeEach(() => {
    state.rowsByUser.clear();
    state.reconcile = null;
    state.lastFilterUserId = null;
    state.removeChannelCalls = 0;
    useSessionMock.mockReset();
  });

  it('is empty with no subscription when signed out', async () => {
    useSessionMock.mockReturnValue(sessionFor(null));
    const { result } = renderHook(() => useTaskCompletions());
    expect(result.current.completedTaskIds.size).toBe(0);
    expect(state.reconcile).toBeNull();
  });

  it('fetches and populates the set on sign-in (mount with a user)', async () => {
    state.rowsByUser.set('alice', [row('alice', 't1'), row('alice', 't2')]);
    useSessionMock.mockReturnValue(sessionFor('alice'));
    const { result } = renderHook(() => useTaskCompletions());
    await waitFor(() =>
      expect(result.current.completedTaskIds.has('t1')).toBe(true),
    );
    expect(result.current.completedTaskIds.has('t2')).toBe(true);
    expect(state.lastFilterUserId).toBe('alice');
  });

  it('reconciles keyed INSERT / UPDATE / DELETE by user:task', async () => {
    state.rowsByUser.set('alice', []);
    useSessionMock.mockReturnValue(sessionFor('alice'));
    const { result } = renderHook(() => useTaskCompletions());
    await waitFor(() => expect(state.reconcile).not.toBeNull());

    act(() =>
      state.reconcile!({
        eventType: 'INSERT',
        new: row('alice', 't1'),
      } as RealtimePostgresChangesPayload<TaskCompletionRow>),
    );
    expect(result.current.completedTaskIds.has('t1')).toBe(true);

    // Duplicate INSERT (self-echo) is idempotent on the Set.
    act(() =>
      state.reconcile!({
        eventType: 'INSERT',
        new: row('alice', 't1'),
      } as RealtimePostgresChangesPayload<TaskCompletionRow>),
    );
    expect(result.current.rows.filter((r) => r.taskId === 't1')).toHaveLength(1);

    act(() =>
      state.reconcile!({
        eventType: 'DELETE',
        old: { user_id: 'alice', task_id: 't1' },
      } as RealtimePostgresChangesPayload<TaskCompletionRow>),
    );
    expect(result.current.completedTaskIds.has('t1')).toBe(false);
  });

  it('resets to empty and tears down on sign-out', async () => {
    state.rowsByUser.set('alice', [row('alice', 't1')]);
    useSessionMock.mockReturnValue(sessionFor('alice'));
    const { result, rerender } = renderHook(() => useTaskCompletions());
    await waitFor(() =>
      expect(result.current.completedTaskIds.has('t1')).toBe(true),
    );

    // Sign out: the effect cleanup runs (removeChannel) and the set resets.
    useSessionMock.mockReturnValue(sessionFor(null));
    rerender();
    await waitFor(() => expect(result.current.completedTaskIds.size).toBe(0));
    expect(state.removeChannelCalls).toBeGreaterThanOrEqual(1);
  });

  it('re-keys to the new user on a user change (A -> B), never mixing sets', async () => {
    state.rowsByUser.set('alice', [row('alice', 't1')]);
    state.rowsByUser.set('bob', [row('bob', 'tb')]);
    useSessionMock.mockReturnValue(sessionFor('alice'));
    const { result, rerender } = renderHook(() => useTaskCompletions());
    await waitFor(() =>
      expect(result.current.completedTaskIds.has('t1')).toBe(true),
    );

    useSessionMock.mockReturnValue(sessionFor('bob'));
    rerender();
    await waitFor(() =>
      expect(result.current.completedTaskIds.has('tb')).toBe(true),
    );
    // Alice's completion is gone — the sets never mix.
    expect(result.current.completedTaskIds.has('t1')).toBe(false);
    expect(state.lastFilterUserId).toBe('bob');
  });
});
