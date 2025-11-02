/**
 * Cache constants
 *
 * Default cache configuration values including TTL (time to live) settings.
 */

export const CACHE_CONSTANTS = {
  /** Default cache TTL: 5 minutes (300 seconds) */
  DEFAULT_TTL_SECONDS: 300,

  /** Short-lived cache: 1 minute (60 seconds) */
  SHORT_TTL_SECONDS: 60,

  /** Medium-lived cache: 15 minutes (900 seconds) */
  MEDIUM_TTL_SECONDS: 900,

  /** Long-lived cache: 1 hour (3600 seconds) */
  LONG_TTL_SECONDS: 3600,

  /** Very long-lived cache: 24 hours (86400 seconds) */
  VERY_LONG_TTL_SECONDS: 86400,
} as const;

/**
 * Cache namespaces
 *
 * Used to prevent key collisions in distributed cache.
 */
export const CACHE_NAMESPACES = {
  /** Rate limiting namespace */
  RATE_LIMIT: 'rate_limit',

  /** User cache namespace */
  USER: 'user',

  /** Task cache namespace */
  TASK: 'task',

  /** General application cache namespace */
  APP: 'app',
} as const;
