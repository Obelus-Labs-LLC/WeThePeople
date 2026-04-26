import { Alert, Linking } from 'react-native';

/**
 * Safely open an external URL. Validates the scheme is http/https and
 * wraps the call in both sync try/catch and async .catch — older RN on
 * Android can throw synchronously on a malformed URL parse, which the
 * promise-only `.catch` doesn't handle. Falls back to a quiet alert
 * rather than crashing the screen.
 */
export function openExternalUrl(url: string | null | undefined, label: string = 'link'): void {
  if (!url || typeof url !== 'string') {
    Alert.alert('Unavailable', `No ${label} provided.`);
    return;
  }
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    Alert.alert('Unavailable', `That ${label} isn't a regular web URL.`);
    return;
  }
  try {
    Linking.openURL(trimmed).catch(() => {
      Alert.alert('Could not open', `Could not open the ${label}. The link may be broken.`);
    });
  } catch {
    Alert.alert('Could not open', `Could not open the ${label}. The link may be broken.`);
  }
}
