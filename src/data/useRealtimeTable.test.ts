import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * Mock the Supabase client. `from().select()` resolves with a scripted queue of
 * results so a test can hand back a transient error (or several) followed by a
 * success, or a persistent failure that exhausts the retries. `channel()` /
 * `removeChannel()` are no-op stubs — these tests exercise the REST fetch path
 * (the only place that sets status === 'error'), not Realtime.
 *
 * Uses REAL timers: the hook's backoff is short (300ms + 900ms) so the whole
 * suite stays fast, and testing-library's waitFor polls on real timers.
 */
type FetchResult = { data: unknown[] | null; error: unknown };

const { supabaseMock, state } = vi.hoisted(() => {
  const state = {
    // FIFO queue of results for successive `select()` calls; the last entry is
    // reused once the queue drains so a persistent failure keeps failing.
    results: [] as FetchResult[],
    selectCalls: 0,
  };

  const query = {
    select() {
      state.selectCalls += 1;
      const next =
        state.results.length > 1
          ? state.results.shift()!
          : (state.results[0] ?? { data: [], error: null });
      return Promise.resolve(next);
    },
  };

  const channel = {
    on() {
      return this;
    },
    subscribe() {
      return this;
    },
  };

  const supabaseMock = {
    from: () => query,
    channel: () => channel,
    removeChannel: () => Promise.resolve('ok'),
  };

  return { supabaseMock, state };
});

vi.mock('../lib/supabase', () => ({
  supabase: supabaseMock,
  realtimeFallback: false,
}));

import { useRealtimeTable } from './useRealtimeTable';

interface Row {
  id: string;
  name: string;
}
const identity = (row: Row): Row => row;

function ok(rows: Row[]): FetchResult {
  return { data: rows, error: null };
}
function fail(): FetchResult {
  return { data: null, error: { message: 'transient' } };
}

describe('useRealtimeTable transient-failure resilience', () => {
  beforeEach(() => {
    state.results = [];
    state.selectCalls = 0;
  });

  it('does NOT error when a transient fetch failure is followed by success', async () => {
    // First read fails (token-rotation window), retry succeeds.
    state.results = [fail(), ok([{ id: 'a', name: 'A' }])];
    const { result } = renderHook(() =>
      useRealtimeTable<Row, Row>('subjects', identity),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.status).not.toBe('error');
    expect(result.current.data).toEqual([{ id: 'a', name: 'A' }]);
  });

  it('tolerates two transient failures before a success (bounded retries)', async () => {
    state.results = [fail(), fail(), ok([{ id: 'b', name: 'B' }])];
    const { result } = renderHook(() =>
      useRealtimeTable<Row, Row>('tasks', identity),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'), {
      timeout: 3000,
    });
    expect(result.current.data).toEqual([{ id: 'b', name: 'B' }]);
  });

  it('surfaces status === error when a persistent failure exhausts retries', async () => {
    state.results = [fail()]; // single entry is reused -> always fails
    const { result } = renderHook(() =>
      useRealtimeTable<Row, Row>('events', identity),
    );

    await waitFor(() => expect(result.current.status).toBe('error'), {
      timeout: 3000,
    });
    // One mount fetch = 3 select() calls (initial + 2 retries).
    expect(state.selectCalls).toBe(3);
  });

  it('keeps last-good data visible after a later persistent failure', async () => {
    // Mount succeeds, then a focus-triggered refetch fails persistently.
    state.results = [ok([{ id: 'c', name: 'C' }])];
    const { result } = renderHook(() =>
      useRealtimeTable<Row, Row>('subjects', identity),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Now make every subsequent read fail and trigger a self-heal refetch.
    state.results = [fail()];
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(result.current.status).toBe('error'), {
      timeout: 3000,
    });
    // Data is NOT clobbered — the last-good row stays on screen.
    expect(result.current.data).toEqual([{ id: 'c', name: 'C' }]);
  });
});
