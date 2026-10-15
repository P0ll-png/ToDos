/**
 * Layout — owns the board state and the desktop 70% / 30% grid. The left column
 * stacks a view toggle over either the ScheduleGrid (weekly) or the
 * MonthCalendar (month), then the DetailsPanel; the right column is the
 * TaskList. It wires the data hooks (subjects, slots, tasks, events) and the
 * per-account completion hook.
 *
 * Subject selection drives the weekly ScheduleGrid highlight + DetailsPanel. In
 * month view a selected DAY drives the DetailsPanel instead (its items are the
 * merged tasks+events for that day). If the selected subject disappears from
 * the live subjects array (an officer deleted it via Realtime), selection is
 * cleared.
 *
 * Layout classes live in base.css: .board-main is the desktop 70%/30% grid
 * which collapses to a single column at <=860px, stacking schedule -> details
 * -> list (the natural DOM order). The ScheduleGrid scrolls horizontally on its
 * own so the page never overflows on mobile.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSubjects } from '../data/useSubjects';
import { useScheduleSlots } from '../data/useScheduleSlots';
import { useTasks } from '../data/useTasks';
import { useEvents } from '../data/useEvents';
import { useTaskCompletions } from '../data/useTaskCompletions';
import { useEventCompletions } from '../data/useEventCompletions';
import { useSession } from '../context/SessionProvider';
import { mergeCalendarItems } from '../lib/calendar';
import { localTodayISO } from '../lib/derive';
import { BoardViewToggle, type BoardView } from './BoardViewToggle';
import { ScheduleGrid } from './ScheduleGrid';
import { MonthCalendar } from './MonthCalendar';
import { DetailsPanel } from './DetailsPanel';
import { TaskList } from './TaskList';

export function Layout() {
  const { session } = useSession();
  // Auth epoch for the board hooks: the signed-in user id (or null when signed
  // out). It changes exactly when auth settles after SIGNED_IN, driving one
  // clean resubscribe + refetch with the FINAL token instead of racing the
  // token-rotation window — the fix for the signed-in "Couldn't load the latest
  // data" glitch.
  const authEpoch = session?.user.id ?? null;
  const subjectsState = useSubjects(undefined, authEpoch);
  const slotsState = useScheduleSlots(undefined, authEpoch);
  const tasksState = useTasks(undefined, authEpoch);
  const eventsState = useEvents(undefined, authEpoch);
  const completions = useTaskCompletions();
  const eventCompletions = useEventCompletions();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    null,
  );
  const [view, setView] = useState<BoardView>('weekly');
  const now = new Date();
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Clear selection if the selected subject is gone (deleted via Realtime).
  const subjects = subjectsState.data;
  useEffect(() => {
    if (
      selectedSubjectId !== null &&
      !subjects.some((s) => s.id === selectedSubjectId)
    ) {
      setSelectedSubjectId(null);
    }
  }, [subjects, selectedSubjectId]);

  const signedIn = session != null;
  const completedTaskIds = completions.completedTaskIds;
  const completedEventIds = eventCompletions.completedEventIds;
  const viewer = useMemo(
    () => (signedIn ? { signedIn: true, completedTaskIds } : null),
    [signedIn, completedTaskIds],
  );

  // The merged items for the selected day (month view DetailsPanel).
  const dayItems = useMemo(() => {
    if (view !== 'month' || selectedDay == null) return [];
    return mergeCalendarItems(
      tasksState.data,
      eventsState.data,
      completedTaskIds,
    ).filter((item) => item.datePart === selectedDay);
  }, [view, selectedDay, tasksState.data, eventsState.data, completedTaskIds]);

  const anyError =
    subjectsState.status === 'error' ||
    slotsState.status === 'error' ||
    tasksState.status === 'error' ||
    eventsState.status === 'error';

  function retryAll() {
    subjectsState.retry();
    slotsState.retry();
    tasksState.retry();
    eventsState.retry();
  }

  function handleChangeMonth(y: number, m0: number) {
    setMonthYear(y);
    setMonth0(m0);
  }

  function handleSwitchView(next: BoardView) {
    setView(next);
    // Default the month view to today's month and select today for a useful
    // first render.
    if (next === 'month') {
      const t = new Date();
      setMonthYear(t.getFullYear());
      setMonth0(t.getMonth());
      setSelectedDay(localTodayISO(t));
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {anyError && (
        <div role="alert" style={errorBarStyle}>
          <span>Couldn&apos;t load the latest data.</span>
          <button type="button" onClick={retryAll} style={retryButtonStyle}>
            Retry
          </button>
        </div>
      )}

      <main className="board-main">
        <div className="board-left">
          <BoardViewToggle view={view} onChange={handleSwitchView} />
          {view === 'weekly' ? (
            <ScheduleGrid
              subjects={subjects}
              slots={slotsState.data}
              tasks={tasksState.data}
              events={eventsState.data}
              viewer={viewer}
              selectedSubjectId={selectedSubjectId}
              onSelectSubject={setSelectedSubjectId}
            />
          ) : (
            <MonthCalendar
              tasks={tasksState.data}
              events={eventsState.data}
              completedTaskIds={completedTaskIds}
              year={monthYear}
              month0={month0}
              onChangeMonth={handleChangeMonth}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          )}
          <DetailsPanel
            subjects={subjects}
            tasks={tasksState.data}
            events={eventsState.data}
            selectedSubjectId={selectedSubjectId}
            selectedDay={view === 'month' ? selectedDay : null}
            dayItems={dayItems}
            completedEventIds={completedEventIds}
            signedIn={signedIn}
          />
        </div>
        <div className="board-right">
          <TaskList
            subjects={subjects}
            tasks={tasksState.data}
            events={eventsState.data}
            completedTaskIds={completedTaskIds}
            onAddLocalCompletion={completions.addLocal}
            onRemoveLocalCompletion={completions.removeLocal}
            completedEventIds={completedEventIds}
            onAddLocalEventCompletion={eventCompletions.addLocal}
            onRemoveLocalEventCompletion={eventCompletions.removeLocal}
          />
        </div>
      </main>
    </div>
  );
}

const errorBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: '0.5rem 1rem',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  borderBottom: '1px solid var(--danger)',
};

const retryButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  fontWeight: 500,
};
