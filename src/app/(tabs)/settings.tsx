import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';

import { PrivacyPromise } from '@/components/privacy-promise';
import { TabScreen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Checkbox, Radio, SectionHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { canLock, LOCK_SETTING, lockEnabled, unlock } from '@/lib/app-lock';
import { AI_SETTING, type AiMode, aiModeOf, isAiConfigured } from '@/lib/ai/client';
import { deleteAllAttachments } from '@/lib/attachments';
import { exportBackup, importBackup } from '@/lib/backup-file';
import { getSetting, setSetting } from '@/lib/db/items';
import { useDatabase } from '@/lib/db/provider';
import { DIGEST_SETTING, digestTimeOf } from '@/lib/digest';
import { ensureNotificationPermission, fireNewestSoon, refreshSummaries } from '@/lib/reminders';

const DIGEST_TIMES: { value: string | null; label: string }[] = [
  { value: null, label: 'Off' },
  { value: '07:30', label: '7:30 AM' },
  { value: '08:30', label: '8:30 AM' },
  { value: '09:30', label: '9:30 AM' },
];

const AI_MODES: { value: AiMode; label: string; detail: string }[] = [
  { value: 'off', label: 'Off', detail: 'Only on-device reading. What you share never leaves your phone.' },
  { value: 'ask', label: 'Ask each time', detail: 'Shows “Improve with AI” on the review screen, with a preview of exactly what is sent.' },
  { value: 'always', label: 'Always', detail: 'Improves every share automatically. You can undo it on the review screen.' },
];

const STORAGE_MODES = [
  { label: 'Keep everything on this device', available: true },
  { label: 'Sync structured information only', available: false },
  { label: 'Sync information + attachments', available: false },
];

export default function SettingsScreen() {
  const db = useDatabase();
  const [notificationsOn, setNotificationsOn] = useState<boolean | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const [aiMode, setAiMode] = useState<AiMode>('ask');
  const [digestTime, setDigestTime] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync().then((p) => setNotificationsOn(p.granted));
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM items').then((r) => setItemCount(r?.count ?? 0));
      getSetting(db, AI_SETTING).then((value) => setAiMode(aiModeOf(value)));
      getSetting(db, DIGEST_SETTING).then((value) => setDigestTime(digestTimeOf(value)));
      getSetting(db, LOCK_SETTING).then((value) => setLocked(lockEnabled(value)));
    }, [db]),
  );

  const enableNotifications = async () => {
    const granted = await ensureNotificationPermission();
    setNotificationsOn(granted);
    if (!granted) Linking.openSettings();
  };

  const toggleLock = async () => {
    if (!locked && !(await canLock())) {
      Alert.alert('Set up a screen lock first', 'Add a PIN, pattern, fingerprint or face unlock in your phone’s settings.');
      return;
    }
    // Confirm it's really the owner, both to turn it on and to turn it off.
    if (!(await unlock())) return;
    setLocked(!locked);
    await setSetting(db, LOCK_SETTING, locked ? 'off' : 'on');
    // The widget hides item titles while the app is locked.
    await refreshSummaries(db);
  };

  const backUp = async () => {
    setBusy('export');
    try {
      await exportBackup(db);
    } catch (error) {
      Alert.alert('Backup failed', String(error));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('import');
    try {
      const result = await importBackup(db);
      if (!result) return;
      const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM items');
      setItemCount(count?.count ?? 0);
      Alert.alert(
        'Restored',
        `${result.added} ${result.added === 1 ? 'item' : 'items'} added.` +
          (result.skipped ? ` ${result.skipped} already on this phone.` : ''),
      );
    } catch (error) {
      Alert.alert('Couldn’t restore', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const deleteEverything = () => {
    Alert.alert('Delete all data?', `This permanently removes ${itemCount} items, their files and reminders from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await Notifications.cancelAllScheduledNotificationsAsync();
          await db.execAsync('DELETE FROM reminders; DELETE FROM items;');
          // Compact the file and empty the write-ahead log so nothing lingers on disk.
          await db.execAsync('VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
          deleteAllAttachments();
          setItemCount(0);
          router.navigate('/');
        },
      },
    ]);
  };

  return (
    <TabScreen title="Settings">
      <SectionHeader title="Your privacy" />
      <Card>
        <PrivacyPromise />
      </Card>

      <SectionHeader title="App lock" />
      <Card>
        <Checkbox
          label="Lock RecallLater"
          detail="Ask for your fingerprint, face or screen lock when you open the app."
          selected={locked}
          onPress={toggleLock}
        />
      </Card>

      <SectionHeader title="Storage" />
      <Card>
        {STORAGE_MODES.map((mode, index) => (
          <Radio
            key={mode.label}
            label={mode.label}
            detail={mode.available ? undefined : 'Coming later'}
            selected={index === 0}
            disabled={!mode.available}
            onPress={() => {}}
          />
        ))}
      </Card>

      {isAiConfigured() ? (
        <>
          <SectionHeader title="AI understanding" />
          <Card>
            {AI_MODES.map((mode) => (
              <Radio
                key={mode.value}
                label={mode.label}
                detail={mode.detail}
                selected={aiMode === mode.value}
                onPress={() => {
                  setAiMode(mode.value);
                  setSetting(db, AI_SETTING, mode.value).catch(console.warn);
                }}
              />
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              AI only ever sees the text read from what you share, never the image, with phone numbers, emails and
              account numbers removed first.
            </ThemedText>
          </Card>
        </>
      ) : null}

      <SectionHeader title="Reminders" />
      <Card>
        <ThemedText>
          {notificationsOn === null ? ' ' : notificationsOn ? 'Notifications are on.' : 'Notifications are off, so reminders cannot reach you.'}
        </ThemedText>
        {notificationsOn === false ? <Button label="Turn on notifications" variant="primary" onPress={enableNotifications} /> : null}
        <ThemedText type="heading" style={styles.subheading}>
          Morning summary
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          One quiet notification with the day’s items. Days with nothing due stay silent.
        </ThemedText>
        {DIGEST_TIMES.map((option) => (
          <Radio
            key={option.label}
            label={option.label}
            selected={digestTime === option.value}
            onPress={async () => {
              if (option.value && !(await ensureNotificationPermission())) {
                setNotificationsOn(false);
                return;
              }
              setDigestTime(option.value);
              await setSetting(db, DIGEST_SETTING, option.value ?? 'off');
              await refreshSummaries(db);
            }}
          />
        ))}
      </Card>

      <SectionHeader title="Data" />
      <Card>
        <ThemedText>
          {itemCount} {itemCount === 1 ? 'item' : 'items'} stored on this device.
        </ThemedText>
        <Button label="Back up to a file…" onPress={backUp} loading={busy === 'export'} disabled={!itemCount || busy !== null} />
        <Button label="Restore from a backup…" onPress={restore} loading={busy === 'import'} disabled={busy !== null} />
        <ThemedText type="small" themeColor="textSecondary">
          A backup holds your items, their files and settings in one file. You choose where it goes. It isn’t
          encrypted, so keep it somewhere private.
        </ThemedText>
        <Button label="Delete all data" variant="danger" onPress={deleteEverything} disabled={!itemCount} />
      </Card>

      {__DEV__ ? (
        <>
          <SectionHeader title="Developer" />
          <Card>
            <Button
              label="Remind about newest item in 5 s"
              onPress={async () => {
                await ensureNotificationPermission();
                const title = await fireNewestSoon(db);
                Alert.alert(title ? `Reminder queued: ${title}` : 'No active items');
              }}
            />
          </Card>
        </>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
        RecallLater {Constants.expoConfig?.version}
      </ThemedText>
    </TabScreen>
  );
}

const styles = StyleSheet.create({

  subheading: {
    marginTop: Spacing.two,
  },
  version: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});
