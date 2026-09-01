export default ({ config }) => {
  const isDevelopment = process.env.APP_VARIANT === 'development';
  
  return {
    ...config,
    expo: {
      name: "ADHD Habits",
      slug: "adhd-habits",
      version: "1.0.37",
      orientation: "portrait",
      icon: "./app/assets/icon.png",
      // Dark, not light: this is a dark-only app, and forcing light pins every
      // iOS *system* colour to its light value. That is invisible while our own
      // gradient covers the root view, but the OS also draws outside our view
      // tree — a presented sheet exposes the root view's systemBackgroundColor
      // (white under light) and the sheet host's systemGroupedBackground
      // (#F2F2F7 under light), which showed as a white band beneath the Screen
      // Time app picker. Dark also makes GlassView's 'auto' colorScheme resolve
      // correctly, so a missing colorScheme="dark" no longer flashes white.
      userInterfaceStyle: "dark",
      splash: {
        image: "./app/assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: process.env.APP_VARIANT === "development" ? "com.mhassan0600.adhd-habits.dev" : "com.mhassan0600.adhd-habits",
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false,
          UIBackgroundModes: ["remote-notification"]
        },
        entitlements: {
          "aps-environment": isDevelopment ? "development" : "production"
        },
      },
      android: {
        adaptiveIcon: {
          foregroundImage: "./app/assets/adaptive-icon.png",
          backgroundColor: "#ffffff"
        }
      },
      web: {
        favicon: "./app/assets/favicon.png"
      },
      extra: {
        eas: {
          projectId: "3301b407-d8a6-4018-bf3c-4f1db722f073"
        }
      },
      runtimeVersion: {
        policy: "appVersion"
      },
      updates: {
        url: "https://u.expo.dev/3301b407-d8a6-4018-bf3c-4f1db722f073"
      },
      owner: "mhassan0600",
      plugins: [
        [
          "expo-notifications",
          {
            icon: "./app/assets/icon.png",
            color: "#ffffff",
            sounds: []
          }
        ],
        [
          "expo-build-properties",
          {
            // react-native-device-activity (Screen Time APIs) needs iOS 15.1+.
            // Note: the individual/self-managed authorization the Focus Gate
            // uses requires iOS 16+ at runtime.
            ios: {
              deploymentTarget: "15.1"
            }
          }
        ],
        [
          "react-native-device-activity",
          {
            appleTeamId: "FUUHGS7ACN",
            // Shared container the app and the Screen Time extensions use to
            // exchange the selection/shield config. Same group for both app
            // variants so a dev build sees the same setup.
            appGroup: "group.com.mhassan0600.adhd-habits.screentime"
          }
        ]
      ]
    }
  };
};