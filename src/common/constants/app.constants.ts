/**
 * Application-wide constants
 *
 * Shared constants used across the application.
 */

export const APP_CONSTANTS = {
  /** Default pagination page size */
  DEFAULT_PAGE_SIZE: 10,

  /** Maximum pagination page size */
  MAX_PAGE_SIZE: 100,

  /** Minimum pagination page size */
  MIN_PAGE_SIZE: 1,

  /** Default pagination page number */
  DEFAULT_PAGE: 1,

  /** Default sort order */
  DEFAULT_SORT_ORDER: 'DESC' as const,

  /** Allowed sort fields for tasks */
  TASK_SORT_FIELDS: ['createdAt', 'updatedAt', 'dueDate', 'title', 'priority', 'status'] as const,

  /** Allowed sort fields for users */
  USER_SORT_FIELDS: ['createdAt', 'updatedAt', 'email', 'name'] as const,

  /** Bcrypt salt rounds for password hashing */
  BCRYPT_SALT_ROUNDS: 10,
} as const;
