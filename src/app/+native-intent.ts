/**
 * expo-sharing opens the app with a `<scheme>://expo-sharing` link when something is
 * shared to RecallLater. The timestamp makes a second share re-trigger processing
 * even if the share screen is already open.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (new URL(path).hostname === 'expo-sharing') {
      return `/share?at=${Date.now()}`;
    }
    return path;
  } catch {
    return '/';
  }
}
