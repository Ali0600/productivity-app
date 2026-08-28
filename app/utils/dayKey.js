// Shared local-calendar-day helpers.
//
// Both the streak badges and the Focus Gate answer "did this happen today?",
// and they must answer it identically — a second copy of this logic would be
// free to drift and silently disagree (a gate that unlocks on a day the streak
// doesn't count, or vice versa). One definition, imported by both.

/**
 * Stable key for the LOCAL calendar day containing `ms`. Local (not UTC) is
 * deliberate: "today" means the user's day, and a UTC key would roll over at
 * the wrong moment for most timezones.
 * @param {number} ms epoch milliseconds
 * @returns {string}
 */
export const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Parse a stored timestamp to epoch ms. Handles a Date (in-session) and an ISO
 * string (rehydrated from AsyncStorage). Returns null for missing/unparseable
 * values so callers can treat them as "never happened".
 * @param {Date|string|number|null|undefined} value
 * @returns {number|null}
 */
export const toMs = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};
