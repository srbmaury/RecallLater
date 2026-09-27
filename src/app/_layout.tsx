import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { LockGate } from '@/components/lock-gate';
import { getSetting } from '@/lib/db/items';
import { DatabaseProvider, useDatabase } from '@/lib/db/provider';
import { handleNotificationResponse, reconcileReminders, setupNotifications } from '@/lib/reminders';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DatabaseProvider>
        <Bootstrap />
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="share" options={{ title: 'New item', gestureEnabled: false }} />
          <Stack.Screen name="add-text" options={{ title: 'Add text' }} />
          <Stack.Screen name="item/[id]" options={{ title: '' }} />
          <Stack.Screen name="collection/[type]" options={{ title: '' }} />
          <Stack.Screen name="welcome" options={{ presentation: 'modal', headerShown: false, gestureEnabled: false }} />
        </Stack>
        <LockGate />
      </DatabaseProvider>
    </ThemeProvider>
  );
}

/** App-wide side effects that need the database: notifications and first-run onboarding. */
function Bootstrap() {
  const db = useDatabase();
  const pathname = usePathname();
  const initialPath = useRef(pathname);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    SplashScreen.hideAsync();
    setupNotifications().catch(console.warn);
    reconcileReminders(db).catch(console.warn);

    // Launched from the share sheet: let the user save first, onboard later.
    if (!initialPath.current.startsWith('/share')) {
      getSetting(db, 'welcomed').then((welcomed) => {
        if (!welcomed) router.push('/welcome');
      });
    }

    const respond = async (response: Notifications.NotificationResponse) => {
      // A cold start can deliver the same response through both paths below.
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      // The morning digest opens Today; item reminders open their item.
      if (response.notification.request.content.data?.digest) {
        router.navigate('/');
        return;
      }
      const itemId = await handleNotificationResponse(db, response);
      if (itemId) router.push({ pathname: '/item/[id]', params: { id: itemId } });
    };

    const last = Notifications.getLastNotificationResponse();
    if (last) {
      Notifications.clearLastNotificationResponse();
      respond(last).catch(console.warn);
    }
    const responses = Notifications.addNotificationResponseReceivedListener((r) => {
      respond(r).catch(console.warn);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconcileReminders(db).catch(console.warn);
    });
    return () => {
      responses.remove();
      appState.remove();
    };
  }, [db]);

  return null;
}
