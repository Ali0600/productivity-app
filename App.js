import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';
import Homepage from './app/screens/Homepage';
import TileGrid from './app/screens/TileGrid';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppStateProvider } from './app/context/AppStateContext';
import { useMainLists } from './app/hooks/useAppState';
import NotificationService from './app/services/notificationService';
import { log } from './app/services/logger';
import { useEffect, useRef } from 'react';

// iOS keeps apps suspended for days, so a cold-launch-only update check rarely
// runs; re-check on foreground, but no more than once per this window.
const OTA_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;

function RootScreen() {
  const { currentMainList } = useMainLists();
  return currentMainList ? <Homepage /> : <TileGrid />;
}

export default function App() {
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        log('🔔 APP.JS: Starting notification initialization...');
        await NotificationService.requestNotificationPermissions();
        await NotificationService.initializeBackgroundNotifications();

        const notificationsEnabled = await NotificationService.getNotificationsEnabled();
        if (notificationsEnabled) {
          await NotificationService.scheduleAllMainListsNotifications();
          log('🔔 APP.JS: Scheduled recurring notifications');
        } else {
          log('🔔 APP.JS: Notifications disabled by user, skipping schedule');
        }
      } catch (error) {
        console.error('🔔 APP.JS: Error in notification setup:', error);
      }
    };

    initializeNotifications();
  }, []);

  const lastOtaCheckAt = useRef(0);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const checkForOTAUpdate = async () => {
      if (__DEV__ || !Updates.isEnabled) return;
      const now = Date.now();
      if (now - lastOtaCheckAt.current < OTA_CHECK_MIN_INTERVAL_MS) return;
      lastOtaCheckAt.current = now;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        Alert.alert(
          'Update Ready',
          'A new version of ADHDone is ready to install.',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Reload',
              onPress: () => {
                Updates.reloadAsync().catch((err) =>
                  console.error('Reload after update failed:', err)
                );
              },
            },
          ]
        );
      } catch (error) {
        console.error('OTA update check failed:', error);
      }
    };

    checkForOTAUpdate();
    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground =
        appStateRef.current.match(/inactive|background/) && nextState === 'active';
      appStateRef.current = nextState;
      if (cameToForeground) checkForOTAUpdate();
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LinearGradient
        style={{ flex: 1 }}
        colors={['#1a1a3a', '#0f0f24', '#070712', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <StatusBar style="light" />
        <AppStateProvider>
          <RootScreen />
        </AppStateProvider>
      </LinearGradient>
    </GestureHandlerRootView>
  );
}
