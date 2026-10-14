import { describe, it, expect } from 'vitest';
import { hasUpcomingAssessment, addDaysYMD } from './events';
import type { EventItem, EventType } from './types';

function ev(partial: Partial<EventItem> & { id: string }): EventItem {
  return {
    title: 'e',
    type: 'quiz',
    subjectId: 'math',
    eventDate: '2025-06-15',
    startTime: null,
    endTime: null,
    location: '',
    notes: '',
    createdBy: null,
    ...partial,
  };
}

describe('addDaysYMD', () => {
  it('adds days within a month', () => {
    expect(addDaysYMD('2025-06-15', 7)).toBe('2025-06-22');
  });

  it('rolls over a month boundary', () => {
    expect(addDaysYMD('2025-06-28', 5)).toBe('2025-07-03');
  });

  it('rolls over a year boundary', () => {
    expect(addDaysYMD('2025-12-30', 3)).toBe('2026-01-02');
  });

  it('subtracts with a negative count', () => {
    expect(addDaysYMD('2025-01-01', -1)).toBe('2024-12-31');
  });
});

describe('hasUpcomingAssessment', () => {
  const today = '2025-06-15';

  it.each<EventType>(['quiz', 'exam', 'presentation'])(
    'includes a %s within the window',
    (type) => {
      const events = [ev({ id: '1', type, eventDate: '2025-06-18' })];
      expect(hasUpcomingAssessment('math', events, today)).toBe(true);
    },
  );

  it('excludes a school_event even within the window', () => {
    const events = [
      ev({ id: '1', type: 'school_event', eventDate: '2025-06-18' }),
    ];
    expect(hasUpcomingAssessment('math', events, today)).toBe(false);
  });

  it('includes an assessment exactly today', () => {
    const events = [ev({ id: '1', eventDate: today })];
    expect(hasUpcomingAssessment('math', events, today)).toBe(true);
  });

  it('includes an assessment exactly +7 days away', () => {
    const events = [ev({ id: '1', eventDate: '2025-06-22' })];
    expect(hasUpcomingAssessment('math', events, today)).toBe(true);
  });

  it('excludes an assessment +8 days away', () => {
    const events = [ev({ id: '1', eventDate: '2025-06-23' })];
    expect(hasUpcomingAssessment('math', events, today)).toBe(false);
  });

  it('excludes an assessment yesterday', () => {
    const events = [ev({ id: '1', eventDate: '2025-06-14' })];
    expect(hasUpcomingAssessment('math', events, today)).toBe(false);
  });

  it('isolates by subject', () => {
    const events = [
      ev({ id: '1', subjectId: 'science', eventDate: '2025-06-18' }),
    ];
    expect(hasUpcomingAssessment('math', events, today)).toBe(false);
  });
});
