import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { PrivacyPromise } from '@/components/privacy-promise';
import { TabScreen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, SectionHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { deleteAllAttachments } from '@/lib/attachments';
import { useDatabase } from '@/lib/db/provider';
import { ensureNotificationPermission } from '@/lib/reminders';

const STORAGE_MODES = [
  { label: 'Keep everything on this device', available: true },
  { label: 'Sync structured information only', available: false },
  { label: 'Sync information + attachments', available: false },
];

export default function SettingsScreen() {
  const db = useDatabase();
  const [notificationsOn, setNotificationsOn] = useState<boolean | null>(null);
  const [itemCount, setItemCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync().then((p) => setNotificationsOn(p.granted));
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM items').then((r) => setItemCount(r?.count ?? 0));
    }, [db]),
  );

  const enableNotifications = async () => {
    const granted = await ensureNotificationPermission();
    setNotificationsOn(granted);
    if (!granted) Linking.openSettings();
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

      <SectionHeader title="Storage" />
      <Card>
        {STORAGE_MODES.map((mode, index) => (
          <View key={mode.label} style={styles.radioRow}>
            <ThemedText themeColor={mode.available ? 'text' : 'textSecondary'}>{index === 0 ? '●' : '○'}</ThemedText>
            <View style={styles.flex}>
              <ThemedText themeColor={mode.available ? 'text' : 'textSecondary'}>{mode.label}</ThemedText>
              {!mode.available ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Coming later
                </ThemedText>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader title="Reminders" />
      <Card>
        <ThemedText>
          {notificationsOn === null ? ' ' : notificationsOn ? 'Notifications are on.' : 'Notifications are off, so reminders cannot reach you.'}
        </ThemedText>
        {notificationsOn === false ? <Button label="Turn on notifications" variant="primary" onPress={enableNotifications} /> : null}
      </Card>

      <SectionHeader title="Data" />
      <Card>
        <ThemedText>
          {itemCount} {itemCount === 1 ? 'item' : 'items'} stored on this device.
        </ThemedText>
        <Button label="Delete all data" variant="danger" onPress={deleteEverything} disabled={!itemCount} />
      </Card>

      <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
        RecallLater {Constants.expoConfig?.version}
      </ThemedText>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  radioRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  flex: {
    flex: 1,
  },
  version: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});
