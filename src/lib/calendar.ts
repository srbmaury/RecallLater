import { requestCalendarPermissions } from 'expo-calendar';
import { createEventInCalendarAsync } from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import type { CalendarSuggestion } from '@/lib/parse';

/**
 * Opens the OS "new event" sheet pre-filled, so the user sees and confirms every
 * detail before anything is written to their calendar.
 */
export async function addToCalendar(event: CalendarSuggestion): Promise<boolean> {
  if (Platform.OS === 'ios') {
    // iOS 17+ needs write-only access even for the system sheet; Android uses an intent.
    const permission = await requestCalendarPermissions(true);
    if (!permission.granted) return false;
  }
  const result = await createEventInCalendarAsync({
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    allDay: event.allDay,
    location: event.location,
    notes: event.notes,
  });
  return result.action === 'saved' || result.action === 'done';
}
