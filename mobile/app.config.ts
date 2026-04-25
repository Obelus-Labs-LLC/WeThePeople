import { ExpoConfig, ConfigContext } from "expo/config";

// Read from environment — set WTP_API_URL before running expo start/eas update
// to override (e.g. local dev against http://10.0.0.x:8006). The fallback is
// production so an EAS update without WTP_API_URL exported doesn't ship a
// localhost URL that the phone can't reach.
const API_URL = process.env.WTP_API_URL || "https://api.wethepeopleforus.com";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "We The People",
  slug: "WeThePeople-App",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#FFFFFF",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.wethepeople.app",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FFFFFF",
    },
    edgeToEdgeEnabled: true,
    package: "com.wethepeople.app",
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  owner: "obelus-labs-llc",
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: "https://u.expo.dev/ae474545-4ca6-48f8-be3d-64b03515ad55",
  },
  extra: {
    apiUrl: API_URL,
    eas: {
      projectId: "ae474545-4ca6-48f8-be3d-64b03515ad55",
    },
  },
});
