export default ({ config }) => {
  const isDevelopment = process.env.APP_VARIANT === 'development';
  
  return {
    ...config,
    expo: {
      name: "ADHD Habits",
      slug: "adhd-habits",
      version: "1.0.35",
      orientation: "portrait",
      icon: "./app/assets/icon.png",
      userInterfaceStyle: "light",
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
        ]
      ]
    }
  };
};