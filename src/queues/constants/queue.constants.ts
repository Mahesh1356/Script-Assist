/**
 * Queue processing constants
 *
 * Configuration values for queue processing, retry logic, and batch operations.
 */

export const QUEUE_CONSTANTS = {
  /** Maximum number of retry attempts for failed jobs */
  MAX_RETRIES: 3,

  /** Initial retry delay in milliseconds */
  RETRY_DELAY_MS: 1000,

  /** Processor concurrency: number of jobs processed simultaneously */
  PROCESSOR_CONCURRENCY: 5,

  /** Rate limiter: maximum jobs per time window */
  RATE_LIMITER_MAX: 10,
  RATE_LIMITER_DURATION_MS: 1000, // Per 1 second
} as const;

export const OVERDUE_TASKS_CONSTANTS = {
  /** Number of tasks to process per batch */
  BATCH_SIZE: 100,

  /** Maximum number of tasks to process per scheduled run */
  MAX_TASKS_PER_RUN: 1000,
} as const;

export const QUEUE_JOB_OPTIONS = {
  /** Number of retry attempts for queue jobs */
  attempts: 3,

  /** Exponential backoff configuration */
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // Start with 2 seconds
  },

  /** Completed job retention */
  removeOnComplete: {
    age: 3600, // Keep completed jobs for 1 hour
    count: 100, // Keep last 100 completed jobs
  },

  /** Failed job retention */
  removeOnFail: {
    age: 86400, // Keep failed jobs for 24 hours
  },
};
