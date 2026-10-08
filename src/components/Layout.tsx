/**
 * Layout — owns the selectedSubjectId state and the desktop 70% / 30% grid. The
 * left column stacks ScheduleGrid over DetailsPanel; the right column is the
 * TaskList. It wires the three data hooks and the Header.
 *
 * Selection is passed to ScheduleGrid (highlight) and DetailsPanel (filter). If
 * the selected subject disappears from the live subjects array (an officer
 * deleted it via Realtime), selection is cleared.
 *
 * Responsive/mobile stacking and the full a11y pass are finalized in FEAT-005;
 * this is the buildable desktop layout.
 */
import { useEffect, useState } from 'react';
import { useSubjects } from '../data/useSubjects';
import { useScheduleSlots } from '../data/useScheduleSlots';
import { useTasks } from '../data/useTasks';
import { Header } from './Header';
import { ScheduleGrid } from './ScheduleGrid';
import { DetailsPanel } from './DetailsPanel';
import { TaskList } from './TaskList';

export function Layout() {
  const subjectsState = useSubjects();
  const slotsState = useScheduleSlots();
  const tasksState = useTasks();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    null,
  );

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

  const anyError =
    subjectsState.status === 'error' ||
    slotsState.status === 'error' ||
    tasksState.status === 'error';

  function retryAll() {
    subjectsState.retry();
    slotsState.retry();
    tasksState.retry();
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <Header />

      {anyError && (
        <div role="alert" style={errorBarStyle}>
          <span>Couldn&apos;t load the latest data.</span>
          <button type="button" onClick={retryAll} style={retryButtonStyle}>
            Retry
          </button>
        </div>
      )}

      <main style={mainStyle}>
        <div style={leftColumnStyle}>
          <ScheduleGrid
            subjects={subjects}
            slots={slotsState.data}
            tasks={tasksState.data}
            selectedSubjectId={selectedSubjectId}
            onSelectSubject={setSelectedSubjectId}
          />
          <DetailsPanel
            subjects={subjects}
            tasks={tasksState.data}
            selectedSubjectId={selectedSubjectId}
          />
        </div>
        <div style={rightColumnStyle}>
          <TaskList subjects={subjects} tasks={tasksState.data} />
        </div>
      </main>
    </div>
  );
}

const mainStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '70% 30%',
  gap: '1rem',
  padding: '1rem',
  alignItems: 'start',
};

const leftColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  minWidth: 0,
};

const rightColumnStyle: React.CSSProperties = {
  minWidth: 0,
};

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
