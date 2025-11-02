/**
 * Rate limiting constants
 *
 * Default rate limit configurations for different endpoint types.
 * These values can be overridden per-route using the @RateLimit() decorator.
 */

export const RATE_LIMIT_CONSTANTS = {
  /** Default rate limit: 100 requests per window */
  DEFAULT_LIMIT: 100,

  /** Default time window: 60 seconds (1 minute) */
  DEFAULT_WINDOW_MS: 60 * 1000,

  /** Strict rate limit for authentication endpoints: 10 requests per minute */
  AUTH_LIMIT: 10,
  AUTH_WINDOW_MS: 60 * 1000,

  /** Very strict rate limit for login: 5 requests per minute */
  LOGIN_LIMIT: 5,
  LOGIN_WINDOW_MS: 60 * 1000,

  /** Very strict rate limit for registration: 3 requests per minute */
  REGISTER_LIMIT: 3,
  REGISTER_WINDOW_MS: 60 * 1000,

  /** Moderate rate limit for refresh token: 20 requests per minute */
  REFRESH_TOKEN_LIMIT: 20,
  REFRESH_TOKEN_WINDOW_MS: 60 * 1000,

  /** Task endpoints: 100 requests per minute */
  TASK_LIMIT: 100,
  TASK_WINDOW_MS: 60 * 1000,

  /** User endpoints: 50 requests per minute */
  USER_LIMIT: 50,
  USER_WINDOW_MS: 60 * 1000,
} as const;
