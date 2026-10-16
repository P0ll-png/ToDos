/**
 * event-time.ts — pure helpers for formatting an event's time range, shared by
 * EventRow (collapsed pill) and EventDetails (popup). 'HH:MM:SS'/'HH:MM' times
 * are date-free strings and are never passed through `new Date()`.
 */
import type { EventItem } from './types';

/** 'HH:MM:SS' / 'HH:MM' -> 'HH:MM'. */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** The ' · HH:MM' / ' · HH:MM–HH:MM' suffix for an event's time range (or ''). */
export function eventTimeLabel(event: EventItem): string {
  if (event.startTime == null) return '';
  if (event.endTime == null) return ` · ${hhmm(event.startTime)}`;
  return ` · ${hhmm(event.startTime)}–${hhmm(event.endTime)}`;
}
