import 'expo-router/entry';

import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from '@/widgets/today';

// The home-screen widget renders in a headless task, outside the app's screens.
registerWidgetTaskHandler(widgetTaskHandler);
