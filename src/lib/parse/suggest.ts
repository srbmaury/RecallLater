import { addDays, atTime, hasTime, parseLocalDateTime, startOfDay } from '@/lib/dates';
import type { ExtractedFields, ItemType, LocalDateTime, ReminderMode } from '@/lib/types';

export type ReminderSuggestion = { mode: Exclude<ReminderMode, 'none'>; fireAt: Date };

export type CalendarSuggestion = {
  title: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  location?: string;
  notes?: string;
};

const EVENING = 19;
const MORNING = 9;

/**
 * The reminder RecallLater proposes on the review screen. Obligations (bills, asks)
 * default to "remind until done"; everything else to a single nudge or none.
 */
export function suggestReminder(type: ItemType, fields: ExtractedFields, now: Date): ReminderSuggestion | null {
  switch (type) {
    case 'bill':
      return fields.dueDate ? beforeDeadline(fields.dueDate, now, 'until_done') : null;
    case 'task':
      if (fields.dueDate) return beforeDeadline(fields.dueDate, now, 'until_done');
      return { mode: 'until_done', fireAt: atTime(addDays(now, 1), MORNING) };
    case 'travel': {
      if (!fields.startsAt) return null;
      const departure = parseLocalDateTime(fields.startsAt);
      const fireAt = hasTime(fields.startsAt)
        ? new Date(departure.getTime() - 3 * 3_600_000)
        : atTime(addDays(departure, -1), EVENING);
      return future({ mode: 'once', fireAt }, now);
    }
    case 'event':
      return fields.startsAt ? beforeDeadline(fields.startsAt, now, 'once') : null;
    case 'receipt':
      return fields.returnBy ? beforeDeadline(fields.returnBy, now, 'once') : null;
    case 'purchase':
    case 'generic':
      return fields.expiresOn ? beforeDeadline(fields.expiresOn, now, 'once') : null;
  }
}

export function suggestCalendar(type: ItemType, title: string, fields: ExtractedFields): CalendarSuggestion | null {
  if ((type !== 'travel' && type !== 'event') || !fields.startsAt) return null;
  const startDate = parseLocalDateTime(fields.startsAt);
  const allDay = !hasTime(fields.startsAt);
  const hours = type === 'travel' ? 2 : 1;
  return {
    title,
    startDate,
    endDate: allDay ? addDays(startDate, 1) : new Date(startDate.getTime() + hours * 3_600_000),
    allDay,
    notes: [fields.flightNumber, fields.trainNumber && `Train ${fields.trainNumber}`, fields.pnr && `PNR ${fields.pnr}`]
      .filter(Boolean)
      .join(' · ') || undefined,
  };
}

/** The evening before the deadline; if that has passed but the deadline hasn't, soon. */
function beforeDeadline(deadline: LocalDateTime, now: Date, mode: ReminderSuggestion['mode']): ReminderSuggestion | null {
  const due = parseLocalDateTime(deadline);
  const dueEnd = hasTime(deadline) ? due : atTime(due, 23, 59);
  if (dueEnd.getTime() <= now.getTime()) return null;

  const eveningBefore = atTime(addDays(startOfDay(due), -1), EVENING);
  if (eveningBefore.getTime() > now.getTime()) return { mode, fireAt: eveningBefore };

  // Deadline is today or tomorrow morning: nudge at the next sensible slot.
  const inAnHour = new Date(now.getTime() + 3_600_000);
  inAnHour.setMinutes(0, 0, 0);
  const latest = hasTime(deadline) ? new Date(due.getTime() - 3_600_000) : atTime(due, EVENING);
  const fireAt = inAnHour.getTime() < latest.getTime() ? inAnHour : new Date(now.getTime() + 15 * 60_000);
  return fireAt.getTime() < dueEnd.getTime() ? { mode, fireAt } : null;
}

function future(suggestion: ReminderSuggestion, now: Date): ReminderSuggestion | null {
  return suggestion.fireAt.getTime() > now.getTime() ? suggestion : null;
}
