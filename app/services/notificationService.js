import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notifications to show when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const isInQuietHours = (date, startMin, endMin) => {
  if (startMin === endMin) return false;
  const minOfDay = date.getHours() * 60 + date.getMinutes();
  if (startMin < endMin) {
    return minOfDay >= startMin && minOfDay < endMin;
  }
  return minOfDay >= startMin || minOfDay < endMin;
};

const startOfDayMs = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

const isRuleActive = (rule, sourceMainList, triggerDate, armedAt) => {
  if (!rule || !sourceMainList) return false;
  const dayStart = startOfDayMs(triggerDate);
  const armed = armedAt ? new Date(armedAt).getTime() : 0;
  const lowerBound = Math.max(dayStart, armed);
  const dayEnd = triggerDate.getTime();
  const hitWindow = (ts) => {
    const t = ts ? new Date(ts).getTime() : 0;
    return t >= lowerBound && t < dayEnd;
  };
  if (rule.type === 'task') {
    const sl = sourceMainList.sideLists?.find((s) => s.listName === rule.sideListName);
    const task = sl?.tasks?.find((t) => t.id === rule.taskId);
    return hitWindow(task?.completedAt);
  }
  if (rule.type === 'sideList') {
    const sl = sourceMainList.sideLists?.find((s) => s.listName === rule.sideListName);
    return hitWindow(sl?.lastCompletedAt);
  }
  if (rule.type === 'mainList') {
    return (sourceMainList.sideLists ?? []).some((sl) => hitWindow(sl.lastCompletedAt));
  }
  return false;
};

export default class NotificationService {
  static RECURRING_NOTIFICATIONS_KEY = 'recurringNotificationIds';
  static NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';
  static QUIET_HOURS_ENABLED_KEY = 'quietHoursEnabled';
  static QUIET_HOURS_START_KEY = 'quietHoursStartMinutes';
  static QUIET_HOURS_END_KEY = 'quietHoursEndMinutes';
  static MAX_SCHEDULED_NOTIFICATIONS = 60; // iOS allows up to 64

  static async getQuietHours() {
    const [enabledRaw, startRaw, endRaw] = await Promise.all([
      AsyncStorage.getItem(this.QUIET_HOURS_ENABLED_KEY),
      AsyncStorage.getItem(this.QUIET_HOURS_START_KEY),
      AsyncStorage.getItem(this.QUIET_HOURS_END_KEY),
    ]);
    return {
      enabled: enabledRaw === 'true',
      startMinutes: startRaw != null ? parseInt(startRaw, 10) : 0,
      endMinutes: endRaw != null ? parseInt(endRaw, 10) : 480,
    };
  }

  static async setQuietHours({ enabled, startMinutes, endMinutes }) {
    await AsyncStorage.multiSet([
      [this.QUIET_HOURS_ENABLED_KEY, enabled ? 'true' : 'false'],
      [this.QUIET_HOURS_START_KEY, String(startMinutes)],
      [this.QUIET_HOURS_END_KEY, String(endMinutes)],
    ]);
  }

  static async getNotificationsEnabled() {
    try {
      const value = await AsyncStorage.getItem(this.NOTIFICATIONS_ENABLED_KEY);
      // Missing key = first launch; default to enabled to preserve prior behavior.
      return value === null ? true : value === 'true';
    } catch (error) {
      console.error('Error reading notifications-enabled flag:', error);
      return true;
    }
  }

  static async setNotificationsEnabled(enabled) {
    try {
      await AsyncStorage.setItem(this.NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
      if (enabled) {
        await this.scheduleAllMainListsNotifications();
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
        await AsyncStorage.removeItem(this.RECURRING_NOTIFICATIONS_KEY);
      }
      return true;
    } catch (error) {
      console.error('Error setting notifications-enabled flag:', error);
      return false;
    }
  }

  /**
   * Initialize background notification handling
   * @returns {Promise<void>}
   */
  static async initializeBackgroundNotifications() {
    try {
      console.log('Initializing background notification handlers...');

      // Add notification response listeners (when user taps notification)
      const subscription = Notifications.addNotificationResponseReceivedListener(
        this.handleNotificationResponse
      );

      // Add notification received listeners (for foreground)
      const receivedSubscription = Notifications.addNotificationReceivedListener(
        this.handleNotificationReceived
      );

      console.log('Background notification handlers initialized successfully');
      return { subscription, receivedSubscription };
    } catch (error) {
      console.error('Error initializing background notifications:', error);
    }
  }

  /**
   * Handle notification response (when user taps on notification)
   * @param {Object} response - Notification response object
   */
  static handleNotificationResponse = (response) => {
    console.log('Notification response received:', response);
    
    const { notification, userText } = response;
    console.log('User tapped on notification:', notification.request.content.title);
    
    // Handle the notification tap
    // You can navigate to specific screens, update app state, etc.
    if (notification.request.content.data) {
      console.log('Notification data:', notification.request.content.data);
    }
  };

  /**
   * Handle notification received (when app is in foreground)
   * @param {Object} notification - Notification object
   */
  static handleNotificationReceived = (notification) => {
    console.log('Notification received in foreground:', notification);
    
    // Handle foreground notification
    // You can show custom UI, update app state, etc.
  };

  /**
   * Register for push notifications
   * @returns {Promise<string|null>} Expo push token or null if not available
   */
  static async registerForPushNotificationsAsync() {
    let token = null;
    
    //#if (Platform.OS === 'android') {
    //  // Set notification channel for Android
    //  await Notifications.setNotificationChannelAsync('task-reminders', {
    //    name: 'Task Reminders',
    //    importance: Notifications.AndroidImportance.MAX,
    //    vibrationPattern: [0, 250, 250, 250],
    //    lightColor: '#FF231F7C',
    //  });
    //}

    if (Device.isDevice) {
      // Check if we have permission
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      // If we don't have permission, ask for it
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        console.log('Notification permission status:', finalStatus);
      }
      
      // If we still don't have permission, we can't send notifications
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
      }
      
      try {
        // Get the token
        token = (await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig.extra?.eas?.projectId,
        })).data;
        console.log("Successfully obtained push token:", token);
      } catch (tokenError) {
        console.error("Error getting push token:", tokenError);
        // Continue without a token, but at least don't crash
      }
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    return token;
  }

  /**
   * Send an immediate notification
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @returns {Promise<string|null>} - Notification ID or null if failed
   */
  static async sendImmediateNotification(title, body) {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
        },
        trigger: null, // Null trigger means send immediately
      });
      
      return notificationId;
    } catch (error) {
      console.error('Error sending immediate notification:', error);
      return null;
    }
  }

  static async getUpcomingNotifications() {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const formatted = scheduled.map((n) => {
        const data = n.content?.data ?? {};
        const trigger = n.trigger ?? {};
        const fireMs =
          data.scheduledFor ??
          trigger.value ??
          (trigger.date ? new Date(trigger.date).getTime() : null);
        return {
          id: n.identifier,
          title: n.content?.title ?? '',
          body: n.content?.body ?? '',
          fireTime: fireMs ? new Date(fireMs) : null,
          sequence: data.sequence ?? null,
          type: data.type ?? 'unknown',
        };
      });
      return formatted
        .filter((n) => n.fireTime != null)
        .sort((a, b) => a.fireTime.getTime() - b.fireTime.getTime());
    } catch (error) {
      console.error('Error fetching upcoming notifications:', error);
      return [];
    }
  }

  /**
   * Schedule recurring notifications independently for every main list with messages.
   * Each list contributes candidates from its own interval and rules; the merged set
   * is sorted chronologically and capped at MAX_SCHEDULED_NOTIFICATIONS.
   * @returns {Promise<string[]>} - Array of notification IDs
   */
  static async scheduleAllMainListsNotifications(opts = {}) {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await AsyncStorage.removeItem(this.RECURRING_NOTIFICATIONS_KEY);

      const enabled = await this.getNotificationsEnabled();
      if (!enabled) {
        console.log('Notifications disabled; not scheduling.');
        return [];
      }

      let { mainLists } = opts;
      if (!mainLists) {
        const stored = await AsyncStorage.getItem('mainLists');
        mainLists = stored ? JSON.parse(stored) : [];
      }

      const quiet = await this.getQuietHours();
      const baseTime = Date.now();
      const MAX_CANDIDATES_PER_MESSAGE = 200;
      const MAX = this.MAX_SCHEDULED_NOTIFICATIONS;

      const allCandidates = [];

      // Flatten messages across main lists so we can stagger same-interval groups.
      const flatMessages = [];
      for (const ml of mainLists) {
        const messages = Array.isArray(ml.notificationMessages) ? ml.notificationMessages : [];
        if (messages.length === 0) continue;
        const listFallbackMinutes = ml.notificationIntervalMinutes ?? 60;

        for (const m of messages) {
          const body = typeof m === 'string' ? m : m?.body;
          if (!body) continue;
          const rule = typeof m === 'string' ? null : m?.rule;
          const armedAt = typeof m === 'string' ? null : m?.armedAt;
          const intervalMinutes = (typeof m === 'string' ? null : m?.intervalMinutes) ?? listFallbackMinutes;
          flatMessages.push({ ml, body, rule, armedAt, intervalMinutes });
        }
      }

      // Within each same-interval group, offset messages by (idx / groupSize) * interval
      // so two 60-min messages land 30 min apart instead of firing together.
      const groupTotals = new Map();
      for (const fm of flatMessages) {
        groupTotals.set(fm.intervalMinutes, (groupTotals.get(fm.intervalMinutes) ?? 0) + 1);
      }
      const groupSeen = new Map();
      for (const fm of flatMessages) {
        const idx = groupSeen.get(fm.intervalMinutes) ?? 0;
        const total = groupTotals.get(fm.intervalMinutes);
        const intervalMs = fm.intervalMinutes * 60 * 1000;
        fm.staggerOffsetMs = total > 1 ? Math.round((idx * intervalMs) / total) : 0;
        groupSeen.set(fm.intervalMinutes, idx + 1);
      }

      for (const fm of flatMessages) {
        const { ml, body, rule, armedAt, intervalMinutes, staggerOffsetMs } = fm;
        const intervalMs = intervalMinutes * 60 * 1000;

        let scheduledFromMessage = 0;
        let candidate = 0;
        while (scheduledFromMessage < MAX && candidate < MAX_CANDIDATES_PER_MESSAGE) {
          candidate += 1;
          const triggerDate = new Date(baseTime + staggerOffsetMs + candidate * intervalMs);
          if (quiet.enabled && isInQuietHours(triggerDate, quiet.startMinutes, quiet.endMinutes)) continue;
          if (isRuleActive(rule, ml, triggerDate, armedAt)) continue;

          allCandidates.push({
            fireTime: triggerDate,
            body,
            sourceListName: ml.name,
          });
          scheduledFromMessage += 1;
        }
      }

      allCandidates.sort((a, b) => a.fireTime.getTime() - b.fireTime.getTime());
      const toSchedule = allCandidates.slice(0, MAX);

      const tasks = toSchedule.map((c, idx) =>
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Productivity Reminder',
            body: c.body,
            sound: true,
            data: {
              type: 'recurring_reminder',
              sequence: idx + 1,
              scheduledFor: c.fireTime.getTime(),
              sourceMainList: c.sourceListName,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: c.fireTime,
          },
        })
      );

      const notificationIds = await Promise.all(tasks);
      await AsyncStorage.setItem(this.RECURRING_NOTIFICATIONS_KEY, JSON.stringify(notificationIds));

      const quietLabel = quiet.enabled ? `${quiet.startMinutes}–${quiet.endMinutes}` : 'off';
      console.log(`Scheduled ${notificationIds.length} notifications across ${mainLists.length} main list(s) (quiet=${quietLabel}).`);
      return notificationIds;
    } catch (error) {
      console.error('Error scheduling notifications:', error);
      return [];
    }
  }

  /**
   * Get status of recurring notifications
   * @returns {Promise<Object>} - Status object with count and next notification time
   */
  static async getRecurringNotificationStatus() {
    try {
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const recurringNotifications = scheduledNotifications.filter(
        notification => notification.content.data?.type === 'recurring_reminder'
      );
      
      let nextNotificationTime = null;
      if (recurringNotifications.length > 0) {
        const nextNotification = recurringNotifications.reduce((earliest, current) => {
          const currentTime = current.trigger?.date || current.trigger?.dateComponents;
          const earliestTime = earliest.trigger?.date || earliest.trigger?.dateComponents;
          return currentTime < earliestTime ? current : earliest;
        });
        nextNotificationTime = nextNotification.trigger?.date || nextNotification.trigger?.dateComponents;
      }
      
      return {
        count: recurringNotifications.length,
        nextNotificationTime,
        isActive: recurringNotifications.length > 0,
      };
    } catch (error) {
      console.error('Error getting recurring notification status:', error);
      return { count: 0, nextNotificationTime: null, isActive: false };
    }
  }
}