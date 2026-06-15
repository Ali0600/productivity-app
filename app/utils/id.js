let counter = 0;

/**
 * Collision-resistant id generator.
 * `Date.now()` keeps ids unique across sessions; the monotonic counter
 * disambiguates multiple ids created within the same millisecond (e.g. a
 * rapid double-add), which a bare `task-${Date.now()}` could not.
 *
 * @param {string} prefix - id namespace (default: 'task')
 * @returns {string}
 */
export function makeId(prefix = 'task') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}
