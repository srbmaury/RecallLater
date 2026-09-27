// Widget trees are rendered by plain function calls, not React, so the React Compiler must
// leave this file alone.
'use no memo';

import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { Colors } from '@/constants/theme';
import type { TodayGlance } from '@/lib/glance';

type Palette = Record<keyof (typeof Colors)['light'], `#${string}`>;

/** The "Today" home-screen widget. Tapping an item opens it; anywhere else opens Today. */
export function TodayWidget({ glance, colors }: { glance: TodayGlance; colors: Palette }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'recalllater://' }}
      accessibilityLabel={`RecallLater: ${glance.headline}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        padding: 16,
        borderRadius: 24,
        backgroundColor: colors.background,
        flexGap: 8,
      }}>
      <TextWidget text="Today" style={{ fontSize: 13, fontWeight: '600', color: colors.tint }} />
      <TextWidget text={glance.headline} style={{ fontSize: 18, fontWeight: '700', color: colors.text }} />
      {glance.rows.map((row) => (
        <FlexWidget
          key={row.id}
          clickAction="OPEN_URI"
          clickActionData={{ uri: `recalllater://item/${row.id}` }}
          style={{
            width: 'match_parent',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 8,
            borderRadius: 12,
            backgroundColor: colors.backgroundElement,
          }}>
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget text={row.title} maxLines={1} truncate="END" style={{ fontSize: 14, color: colors.text }} />
          </FlexWidget>
          <TextWidget text={row.when} style={{ fontSize: 12, color: colors.textSecondary }} />
        </FlexWidget>
      ))}
      {glance.more ? (
        <TextWidget text={`+${glance.more} more`} style={{ fontSize: 12, color: colors.textSecondary }} />
      ) : null}
    </FlexWidget>
  );
}
