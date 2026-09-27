import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { requestWidgetUpdate, type WidgetTaskHandler } from 'react-native-android-widget';

import { Colors } from '@/constants/theme';
import { LOCK_SETTING, lockEnabled } from '@/lib/app-lock';
import { getSetting, listToday } from '@/lib/db/items';
import { getDatabase } from '@/lib/db/provider';
import { buildTodayGlance } from '@/lib/glance';

import { TodayWidget } from './today-widget';

const TODAY_WIDGET = 'Today';

async function renderToday(db: SQLiteDatabase) {
  const now = new Date();
  const glance = buildTodayGlance(await listToday(db, now), now, lockEnabled(await getSetting(db, LOCK_SETTING)));
  return {
    light: <TodayWidget glance={glance} colors={Colors.light} />,
    dark: <TodayWidget glance={glance} colors={Colors.dark} />,
  };
}

/** Redraws any placed Today widgets from the database. Android only; a no-op elsewhere. */
export async function updateTodayWidget(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS !== 'android') return;
  await requestWidgetUpdate({ widgetName: TODAY_WIDGET, renderWidget: () => renderToday(db) });
}

/** Runs headless when the widget is placed, resized or due its periodic refresh. */
export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, renderWidget }) => {
  if (widgetInfo.widgetName !== TODAY_WIDGET || widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  renderWidget(await renderToday(await getDatabase()));
};
