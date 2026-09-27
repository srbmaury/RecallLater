import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LOCK_SETTING, lockEnabled, shouldRelock, unlock } from '@/lib/app-lock';
import { getSetting } from '@/lib/db/items';
import { useDatabase } from '@/lib/db/provider';

type State = 'checking' | 'locked' | 'open';

/**
 * Covers the whole app until the person unlocks it, when App lock is on. It also covers
 * the app while it's in the background, so the app switcher never shows saved items.
 */
export function LockGate() {
  const db = useDatabase();
  const theme = useTheme();
  const [state, setState] = useState<State>('checking');
  const [hidden, setHidden] = useState(false);
  const enabled = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  // The system prompt itself makes the app inactive; that must not count as leaving.
  const prompting = useRef(false);

  const ask = async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (await unlock()) setState('open');
    } finally {
      prompting.current = false;
    }
  };

  useEffect(() => {
    getSetting(db, LOCK_SETTING).then((value) => {
      enabled.current = lockEnabled(value);
      if (!enabled.current) return setState('open');
      setState('locked');
      ask().catch(console.warn);
    });

    const subscription = AppState.addEventListener('change', (next) => {
      if (prompting.current) return;
      if (next === 'active') {
        setHidden(false);
        if (enabled.current && shouldRelock(backgroundedAt.current, Date.now())) {
          setState('locked');
          ask().catch(console.warn);
        }
        backgroundedAt.current = null;
        return;
      }
      backgroundedAt.current ??= Date.now();
      // Settings may have turned the lock on or off since launch.
      getSetting(db, LOCK_SETTING).then((value) => {
        enabled.current = lockEnabled(value);
        setHidden(enabled.current);
      });
    });
    return () => subscription.remove();
  }, [db]);

  if (state === 'open' && !hidden) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }]}>
      {state === 'locked' ? (
        <>
          <ThemedText style={styles.icon}>🔒</ThemedText>
          <ThemedText type="subtitle">RecallLater is locked</ThemedText>
          <Button label="Unlock" variant="primary" onPress={() => ask().catch(console.warn)} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    zIndex: 1000,
  },
  icon: {
    fontSize: 48,
    lineHeight: 56,
  },
});
