/**
 * Dev-only logger. In production builds `log` is a no-op, so debug output —
 * including full data dumps from the storage layer — never ships and doesn't
 * cost I/O. `console.error` / `console.warn` are intentionally left untouched
 * so real problems still surface in production.
 */
export const log = __DEV__ ? console.log.bind(console) : () => {};
