// Pure helper computing a per-main-list daily completion streak.
// A streak is the number of consecutive local calendar days — ending today or
// yesterday — on which at least one task in the main list was completed.
// "Ending yesterday" keeps this morning's streak alive before today's workout.

import { dayKey, toMs } from './dayKey';

/**
 * @param {{ sideLists?: Array<{ tasks?: Array<{ completions?: Array<{ at: number }>, completedAt?: Date|string }> }> }} mainList
 * @param {number} [now] reference time in ms (defaults to Date.now())
 * @returns {number} streak length in days (0 = no active streak)
 */
export const computeStreak = (mainList, now = Date.now()) => {
  const days = new Set();

  for (const sl of mainList?.sideLists ?? []) {
    for (const task of sl?.tasks ?? []) {
      for (const c of task?.completions ?? []) {
        const t = toMs(c?.at);
        if (t != null) days.add(dayKey(t));
      }
      // Pre-history fallback: tasks completed before the completions log
      // existed still contribute their latest completion day.
      const legacy = toMs(task?.completedAt);
      if (legacy != null) days.add(dayKey(legacy));
    }
  }

  if (days.size === 0) return 0;

  // Walk backwards day by day via setDate (DST-safe, unlike subtracting 24h).
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor.getTime()))) return 0;
  }

  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};
