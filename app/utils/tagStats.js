// Pure helpers for aggregating task completion history by tag.
// Used by the "Muscle Recovery" view to rank tags (e.g. muscle groups) by how
// long it's been since any task carrying that tag was last completed.

/**
 * Parse a completedAt value to epoch ms. Handles both a Date (in-session) and
 * an ISO string (rehydrated from AsyncStorage). Returns null for
 * missing/unparseable values.
 * @param {Date|string|null|undefined} value
 * @returns {number|null}
 */
const toMs = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Aggregate every task across the given side lists by tag and compute, per tag,
 * the most recent completion time and how long ago that was.
 *
 * Tags are matched case-insensitively (trimmed, lowercased key) but displayed
 * with their first-seen casing. A task with multiple tags contributes its
 * completion to all of them (e.g. a compound lift tagged Chest + Triceps).
 *
 * @param {Array<{ tasks?: Array<{ tags?: string[], completedAt?: Date|string }> }>} sideLists
 * @param {number} [now] reference time in ms (defaults to Date.now())
 * @returns {Array<{ tag: string, lastCompletedAt: number|null, msSince: number|null, neverCompleted: boolean }>}
 *   Sorted: never-completed first, then longest-since-completion first, then alphabetical.
 */
export const computeTagRecovery = (sideLists, now = Date.now()) => {
  const byTag = new Map(); // lowercased tag -> { tag (display), lastMs }

  for (const sl of sideLists ?? []) {
    for (const task of sl?.tasks ?? []) {
      const completedMs = toMs(task?.completedAt);
      for (const raw of task?.tags ?? []) {
        const tag = (raw ?? '').trim();
        if (!tag) continue;
        const key = tag.toLowerCase();
        const existing = byTag.get(key);
        if (!existing) {
          byTag.set(key, { tag, lastMs: completedMs });
        } else if (
          completedMs != null &&
          (existing.lastMs == null || completedMs > existing.lastMs)
        ) {
          existing.lastMs = completedMs;
        }
      }
    }
  }

  const rows = [...byTag.values()].map(({ tag, lastMs }) => ({
    tag,
    lastCompletedAt: lastMs,
    msSince: lastMs == null ? null : Math.max(0, now - lastMs),
    neverCompleted: lastMs == null,
  }));

  rows.sort((a, b) => {
    if (a.neverCompleted !== b.neverCompleted) {
      return a.neverCompleted ? -1 : 1; // never-completed bubbles to the top
    }
    if (!a.neverCompleted && b.msSince !== a.msSince) {
      return b.msSince - a.msSince; // longest-since-completion first
    }
    return a.tag.localeCompare(b.tag); // stable alphabetical tiebreak
  });

  return rows;
};
