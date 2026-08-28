// Pure evaluation for the Focus Gate: should the user's chosen apps be blocked
// right now?
//
// The rule is "the designated side list is fully completed today" — every task
// in one chosen side list must carry a completion stamped on the current local
// calendar day. Keeping this pure means the decision is unit-testable without
// touching Screen Time APIs, native state, or storage.

import { dayKey, toMs } from './dayKey';

/** Gate config shape persisted under StorageService key `focusGate`. */
export const DEFAULT_GATE_CONFIG = {
  enabled: false,
  mainListName: null,
  sideListName: null,
  // Local hour (0-23) at which the block re-arms each morning.
  rearmHour: 6,
};

/**
 * Locate the configured gating side list.
 * @returns {{ mainList: object|null, sideList: object|null }}
 */
const findTarget = (config, mainLists) => {
  const mainList =
    (mainLists ?? []).find((ml) => ml?.name === config?.mainListName) ?? null;
  const sideList =
    (mainList?.sideLists ?? []).find(
      (sl) => sl?.listName === config?.sideListName
    ) ?? null;
  return { mainList, sideList };
};

/**
 * True when the gate points at a list that no longer exists (renamed, deleted,
 * or its main list removed). Mirrors the pause-rule `isRuleTargetMissing`
 * pattern so the UI can warn with the same vocabulary.
 * @returns {boolean}
 */
export const isGateTargetMissing = (config, mainLists) => {
  if (!config?.enabled) return false;
  if (!config.mainListName || !config.sideListName) return true;
  const { sideList } = findTarget(config, mainLists);
  return sideList === null;
};

/**
 * Was this task completed during the local calendar day containing `now`?
 * Reads the completions log, falling back to the legacy `completedAt` stamp so
 * tasks last completed before the history log shipped still count.
 */
const completedToday = (task, todayKey) => {
  for (const c of task?.completions ?? []) {
    const t = toMs(c?.at);
    if (t != null && dayKey(t) === todayKey) return true;
  }
  const legacy = toMs(task?.completedAt);
  return legacy != null && dayKey(legacy) === todayKey;
};

/**
 * Has the unlock condition been met?
 *
 * An EMPTY gating list is deliberately NOT satisfied: "every task is done" is
 * vacuously true over zero tasks, which would silently unlock everything the
 * moment a list was emptied — the opposite of what the user asked for.
 *
 * @param {object} config gate config
 * @param {Array} mainLists full mainLists tree
 * @param {number} [now] reference time in ms
 * @returns {boolean}
 */
export const isGateSatisfied = (config, mainLists, now = Date.now()) => {
  const { sideList } = findTarget(config, mainLists);
  const tasks = sideList?.tasks ?? [];
  if (tasks.length === 0) return false;
  const todayKey = dayKey(now);
  return tasks.every((task) => completedToday(task, todayKey));
};

/**
 * The single decision the caller acts on: block the selected apps or not.
 *
 * Fails OPEN (never blocks) whenever the gate is off or its target is missing —
 * a gate pointing at a deleted list must not strand the user behind a shield
 * they have no way to satisfy.
 *
 * @returns {{ shouldBlock: boolean, reason: string }}
 */
export const evaluateGate = (config, mainLists, now = Date.now()) => {
  if (!config?.enabled) return { shouldBlock: false, reason: 'disabled' };
  if (isGateTargetMissing(config, mainLists)) {
    return { shouldBlock: false, reason: 'target-missing' };
  }
  if (isGateSatisfied(config, mainLists, now)) {
    return { shouldBlock: false, reason: 'satisfied' };
  }
  return { shouldBlock: true, reason: 'incomplete' };
};

/**
 * Progress for the Focus Gate UI: how much of the gating list is done today.
 * @returns {{ total: number, done: number, remaining: number }}
 */
export const gateProgress = (config, mainLists, now = Date.now()) => {
  const { sideList } = findTarget(config, mainLists);
  const tasks = sideList?.tasks ?? [];
  const todayKey = dayKey(now);
  const done = tasks.filter((task) => completedToday(task, todayKey)).length;
  return { total: tasks.length, done, remaining: tasks.length - done };
};
