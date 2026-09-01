// Focus Gate — thin wrapper over Apple's Screen Time APIs
// (react-native-device-activity: FamilyControls + ManagedSettings + DeviceActivity).
//
// Everything here is defensive by design. The Screen Time APIs are unavailable
// on the simulator, on iOS < 16 for individual authorization, and in any build
// whose native side predates this feature. A missing native module must degrade
// the Focus Gate to "unsupported" — never crash the app around it.

import StorageService from './storageService';
import { log } from './logger';
import { DEFAULT_GATE_CONFIG } from '../utils/focusGate';

// Load the native module defensively: if the binary lacks it, `nativeModule`
// stays null and every call below becomes a logged no-op rather than a crash.
let nativeModule = null;
let loadError = null;
try {
  nativeModule = require('react-native-device-activity');
} catch (err) {
  loadError = err;
  console.warn('Focus Gate: Screen Time module unavailable in this build.', err);
}

const STORAGE_KEY = 'focusGate';

/** Stable ids shared with the native extensions via the app group. */
export const SELECTION_ID = 'focus-gate-selection';
export const REARM_ACTIVITY_NAME = 'focus-gate-rearm';

/** Mirrors AuthorizationStatus in the native module (0/1/2). */
export const AUTH_STATUS = {
  notDetermined: 0,
  denied: 1,
  approved: 2,
};

/**
 * Can this build/device actually run the Focus Gate? False on the simulator,
 * on unsupported iOS versions, and in builds without the native module.
 */
export const isSupported = () => {
  if (!nativeModule) return false;
  try {
    return nativeModule.isAvailable();
  } catch (err) {
    console.warn('Focus Gate: isAvailable() failed.', err);
    return false;
  }
};

/** Why the gate is unsupported, for surfacing in the UI. */
export const unsupportedReason = () => {
  if (loadError) return 'This build does not include Screen Time support.';
  if (!isSupported()) return 'Screen Time is unavailable on this device.';
  return null;
};

// --- Config persistence -----------------------------------------------------

export const loadGateConfig = async () => {
  const stored = await StorageService.getData(STORAGE_KEY, null);
  // Merge over defaults so a config written by an older version gains new keys.
  return stored ? { ...DEFAULT_GATE_CONFIG, ...stored } : { ...DEFAULT_GATE_CONFIG };
};

export const saveGateConfig = async (config) =>
  StorageService.storeData(STORAGE_KEY, config);

// --- Authorization ----------------------------------------------------------

export const getAuthorizationStatus = () => {
  if (!isSupported()) return AUTH_STATUS.notDetermined;
  try {
    return nativeModule.getAuthorizationStatus();
  } catch (err) {
    console.warn('Focus Gate: getAuthorizationStatus() failed.', err);
    return AUTH_STATUS.notDetermined;
  }
};

/**
 * Read the authorization status, waiting for it to settle.
 *
 * `AuthorizationCenter.shared.authorizationStatus` reports `notDetermined` for
 * a short while after launch even when the user approved in an earlier session
 * — so the first synchronous read on a cold start is not trustworthy. The
 * package ships a poll for exactly this (10 attempts, 250ms apart, returning as
 * soon as the status is anything other than `notDetermined`).
 *
 * Pass an AbortController to stop early; the poll resolves with whatever the
 * current status is when aborted.
 */
export const pollAuthorizationStatus = async (abortController) => {
  if (!isSupported()) return AUTH_STATUS.notDetermined;
  try {
    return await nativeModule.pollAuthorizationStatus({ abortController });
  } catch (err) {
    console.warn('Focus Gate: pollAuthorizationStatus() failed.', err);
    return getAuthorizationStatus();
  }
};

/**
 * Prompt for Screen Time authorization. Resolves to the resulting status —
 * requestAuthorization() itself resolves void, so the status is read after.
 */
export const requestAuthorization = async () => {
  if (!isSupported()) return AUTH_STATUS.notDetermined;
  try {
    await nativeModule.requestAuthorization('individual');
  } catch (err) {
    // A denial rejects; treat it as a status rather than an exception.
    console.warn('Focus Gate: authorization request failed.', err);
  }
  return getAuthorizationStatus();
};

// --- App selection ----------------------------------------------------------

/**
 * Counts of what the user currently has selected, read back from the native
 * store. Returns null when unsupported or nothing has been picked yet, so
 * callers can distinguish "no selection" from "zero apps in a selection".
 *
 * The picker sheet writes the selection natively under SELECTION_ID, so this
 * is the only read path — there is no JS-side persist step.
 */
export const getSelectionMetadata = () => {
  if (!isSupported()) return null;
  try {
    return (
      nativeModule.activitySelectionMetadata({
        activitySelectionId: SELECTION_ID,
      }) ?? null
    );
  } catch (err) {
    console.warn('Focus Gate: failed to read selection metadata.', err);
    return null;
  }
};

// --- Shield -----------------------------------------------------------------

/** The block screen shown in place of a gated app. */
const SHIELD_CONFIG = {
  title: 'Finish your list first',
  subtitle: 'ADHDone is holding this app until today’s tasks are done.',
  primaryButtonLabel: 'OK',
  iconSystemName: 'checklist',
  backgroundColor: { red: 26, green: 26, blue: 58, alpha: 1 },
  titleColor: { red: 255, green: 255, blue: 255, alpha: 1 },
  subtitleColor: { red: 199, green: 210, blue: 254, alpha: 1 },
  primaryButtonBackgroundColor: { red: 165, green: 180, blue: 252, alpha: 1 },
};

const SHIELD_ACTIONS = { primary: { behavior: 'close' } };

export const applyShieldAppearance = () => {
  if (!isSupported()) return;
  try {
    nativeModule.updateShield(SHIELD_CONFIG, SHIELD_ACTIONS, 'focus-gate');
  } catch (err) {
    console.warn('Focus Gate: failed to update shield.', err);
  }
};

// --- Block / unblock --------------------------------------------------------

/**
 * Apply the decision from evaluateGate(). Idempotent — safe to call on every
 * task completion and every foreground.
 * @param {boolean} shouldBlock
 * @param {string} reason for the native audit trail
 */
export const applyBlock = (shouldBlock, reason = 'focus-gate') => {
  if (!isSupported()) return false;
  try {
    const selection = { activitySelectionId: SELECTION_ID };
    if (shouldBlock) {
      applyShieldAppearance();
      nativeModule.blockSelection(selection, reason);
    } else {
      nativeModule.unblockSelection(selection, reason);
    }
    return true;
  } catch (err) {
    console.warn(`Focus Gate: failed to ${shouldBlock ? 'block' : 'unblock'}.`, err);
    return false;
  }
};

export const isShieldActive = () => {
  if (!isSupported()) return false;
  try {
    return nativeModule.isShieldActive();
  } catch {
    return false;
  }
};

// --- Daily re-arm -----------------------------------------------------------

/**
 * Schedule the native daily re-block. This runs in the DeviceActivity
 * extension, so the block returns each morning even if ADHDone is never opened
 * — which is the whole point: relying on the user to re-arm would depend on the
 * executive function this feature exists to support.
 *
 * The interval runs from `rearmHour` to one minute before it, i.e. essentially
 * all day, with `intervalDidStart` applying the block. Completing the gating
 * list unblocks early via applyBlock(false).
 *
 * @param {number} rearmHour local hour 0-23
 */
export const scheduleDailyRearm = async (rearmHour) => {
  if (!isSupported()) return false;
  const hour = Number.isInteger(rearmHour) ? Math.min(23, Math.max(0, rearmHour)) : 6;
  try {
    // Re-apply the block when the daily interval opens.
    nativeModule.configureActions({
      activityName: REARM_ACTIVITY_NAME,
      callbackName: 'intervalDidStart',
      actions: [
        {
          type: 'blockSelection',
          familyActivitySelectionId: SELECTION_ID,
        },
      ],
    });

    await nativeModule.startMonitoring(
      REARM_ACTIVITY_NAME,
      {
        intervalStart: { hour, minute: 0, second: 0 },
        // End a minute before the start so the window spans (almost) the full
        // day and repeats cleanly; DeviceActivity rejects a zero-length window.
        intervalEnd: { hour: (hour + 23) % 24, minute: 59, second: 0 },
        repeats: true,
      },
      []
    );
    log(`Focus Gate: daily re-arm scheduled for ${hour}:00`);
    return true;
  } catch (err) {
    console.warn('Focus Gate: failed to schedule daily re-arm.', err);
    return false;
  }
};

export const cancelDailyRearm = () => {
  if (!isSupported()) return;
  try {
    nativeModule.stopMonitoring([REARM_ACTIVITY_NAME]);
    log('Focus Gate: daily re-arm cancelled');
  } catch (err) {
    console.warn('Focus Gate: failed to cancel daily re-arm.', err);
  }
};

/**
 * Turn the gate off completely: stop the schedule and lift any active block.
 * Used when the user disables it and when the gating list disappears.
 */
export const teardown = () => {
  cancelDailyRearm();
  applyBlock(false, 'focus-gate-disabled');
};

/**
 * Apple's own full-screen picker sheet. The inline DeviceActivitySelectionView
 * is deliberately not used: the library's native view sets
 * isUserInteractionEnabled = false on its hosting view, so an embedded picker
 * cannot be tapped at any size. The "Persisted" variant reads and writes the
 * selection under SELECTION_ID itself, so no token ever passes through JS.
 */
export const DeviceActivitySelectionSheet =
  nativeModule?.DeviceActivitySelectionSheetViewPersisted ?? null;
