import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { EventCompletionRow } from '../lib/types';

/**
 * Mock the Supabase client. `from().select().eq()` resolves with whatever rows
 * are queued for the current user; `channel().on().subscribe()` captures the
 * reconcile callback so a test can drive INSERT/UPDATE/DELETE payloads.
 */
const { supabaseMock, state } = vi.hoisted(() => {
  const state = {
    rowsByUser: new Map<string, EventCompletionRow[]>(),
    reconcile: null as
      | ((p: RealtimePostgresChangesPayload<EventCompletionRow>) => void)
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
      cb: (p: RealtimePostgresChangesPayload<EventCompletionRow>) => void,
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

import { useEventCompletions } from './useEventCompletions';

function sessionFor(userId: string | null) {
  return {
    session: userId ? { user: { id: userId, email: `${userId}@x.com` } } : null,
    profile: userId ? { id: userId, name: userId, email: '', role: 'member' } : null,
    role: userId ? 'member' : null,
    isOfficer: false,
    refreshProfile: vi.fn(),
  };
}

function row(userId: string, eventId: string): EventCompletionRow {
  return { user_id: userId, event_id: eventId, completed_at: '2025-01-01T00:00:00Z' };
}

describe('useEventCompletions', () => {
  beforeEach(() => {
    state.rowsByUser.clear();
    state.reconcile = null;
    state.lastFilterUserId = null;
    state.removeChannelCalls = 0;
    useSessionMock.mockReset();
  });

  it('is empty with no subscription when signed out', async () => {
    useSessionMock.mockReturnValue(sessionFor(null));
    const { result } = renderHook(() => useEventCompletions());
    expect(result.current.completedEventIds.size).toBe(0);
    expect(state.reconcile).toBeNull();
  });

  it('fetches and populates the set on sign-in (mount with a user)', async () => {
    state.rowsByUser.set('alice', [row('alice', 'e1'), row('alice', 'e2')]);
    useSessionMock.mockReturnValue(sessionFor('alice'));
    const { result } = renderHook(() => useEventCompletions());
    await waitFor(() =>
      expect(result.current.completedEventIds.has('e1')).toBe(true),
    );
    expect(result.current.completedEventIds.has('e2')).toBe(true);
    expect(state.lastFilterUserId).toBe('alice');
  });

  it('reconciles keyed INSERT / UPDATE / DELETE by user:event', async () => {
    state.rowsByUser.set('alice', []);
    useSessionMock.mockReturnValue(sessionFor('alice'));
    const { result } = renderHook(() => useEventCompletions());
    await waitFor(() => expect(state.reconcile).not.toBeNull());

    act(() =>
      state.reconcile!({
        eventType: 'INSERT',
        new: row('alice', 'e1'),
      } as RealtimePostgresChangesPayload<EventCompletionRow>),
    );
    expect(result.current.completedEventIds.has('e1')).toBe(true);

    // Duplicate INSERT (self-echo) is idempotent on the Set.
    act(() =>
      state.reconcile!({
        eventType: 'INSERT',
        new: row('alice', 'e1'),
      } as RealtimePostgresChangesPayload<EventCompletionRow>),
    );
    expect(result.current.rows.filter((r) => r.eventId === 'e1')).toHaveLength(1);

    act(() =>
      state.reconcile!({
        eventType: 'DELETE',
        old: { user_id: 'alice', event_id: 'e1' },
      } as RealtimePostgresChangesPayload<EventCompletionRow>),
    );
    expect(result.current.completedEventIds.has('e1')).toBe(false);
  });

  it('resets to empty and tears down on sign-out', async () => {
    state.rowsByUser.set('alice', [row('alice', 'e1')]);
    useSessionMock.mockReturnValue(sessionFor('alice'));
    const { result, rerender } = renderHook(() => useEventCompletions());
    await waitFor(() =>
      expect(result.current.completedEventIds.has('e1')).toBe(true),
    );

    // Sign out: the effect cleanup runs (removeChannel) and the set resets.
    useSessionMock.mockReturnValue(sessionFor(null));
    rerender();
    await waitFor(() => expect(result.current.completedEventIds.size).toBe(0));
    expect(state.removeChannelCalls).toBeGreaterThanOrEqual(1);
  });

  it('re-keys to the new user on a user change (A -> B), never mixing sets', async () => {
    state.rowsByUser.set('alice', [row('alice', 'e1')]);
    state.rowsByUser.set('bob', [row('bob', 'eb')]);
    useSessionMock.mockReturnValue(sessionFor('alice'));
    const { result, rerender } = renderHook(() => useEventCompletions());
    await waitFor(() =>
      expect(result.current.completedEventIds.has('e1')).toBe(true),
    );

    useSessionMock.mockReturnValue(sessionFor('bob'));
    rerender();
    await waitFor(() =>
      expect(result.current.completedEventIds.has('eb')).toBe(true),
    );
    // Alice's completion is gone — the sets never mix.
    expect(result.current.completedEventIds.has('e1')).toBe(false);
    expect(state.lastFilterUserId).toBe('bob');
  });
});
