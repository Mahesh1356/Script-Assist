import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { QUEUE_CONSTANTS } from '../constants/queue.constants';

interface TaskStatusUpdateData {
  taskId: string;
  status: TaskStatus;
}

interface OverdueTasksNotificationData {
  taskIds?: string[];
  batchSize?: number;
}

@Injectable()
@Processor('task-processing', {
  concurrency: QUEUE_CONSTANTS.PROCESSOR_CONCURRENCY,
  limiter: {
    max: QUEUE_CONSTANTS.RATE_LIMITER_MAX,
    duration: QUEUE_CONSTANTS.RATE_LIMITER_DURATION_MS,
  },
})
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);
  private readonly MAX_RETRIES = QUEUE_CONSTANTS.MAX_RETRIES;
  private readonly RETRY_DELAY = QUEUE_CONSTANTS.RETRY_DELAY_MS;

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const startTime = Date.now();
    this.logger.debug(
      `Processing job ${job.id} of type ${job.name} (attempt ${job.attemptsMade + 1})`,
    );

    try {
      let result: unknown;

      switch (job.name) {
        case 'task-status-update':
          result = await this.handleStatusUpdate(job);
          break;
        case 'overdue-tasks-notification':
          result = await this.handleOverdueTasks(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name} for job ${job.id}`);
          throw new BadRequestException(`Unknown job type: ${job.name}`);
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Successfully processed job ${job.id} of type ${job.name} in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Log error with context
      this.logger.error(
        `Error processing job ${job.id} of type ${job.name} (attempt ${job.attemptsMade + 1}/${this.MAX_RETRIES}) after ${duration}ms: ${errorMessage}`,
        errorStack,
      );

      // Determine if we should retry
      const shouldRetry = this.shouldRetry(error, job);

      if (shouldRetry && job.attemptsMade < this.MAX_RETRIES) {
        this.logger.warn(
          `Retrying job ${job.id} (attempt ${job.attemptsMade + 1}/${this.MAX_RETRIES})`,
        );
        // BullMQ will handle retry automatically with exponential backoff
        throw error; // Re-throw to trigger retry
      }

      // Max retries exceeded or non-retryable error
      this.logger.error(
        `Job ${job.id} failed after ${job.attemptsMade} attempts. Marking as failed.`,
      );
      throw error;
    }
  }

  private shouldRetry(error: unknown, job: Job): boolean {
    // Don't retry if max attempts reached
    if (job.attemptsMade >= this.MAX_RETRIES) {
      return false;
    }

    // Don't retry validation errors or not found errors
    if (error instanceof BadRequestException || error instanceof NotFoundException) {
      return false;
    }

    // Retry for other errors (network issues, database connection, etc.)
    return true;
  }

  private async handleStatusUpdate(job: Job<TaskStatusUpdateData>): Promise<unknown> {
    const { taskId, status } = job.data;

    // Validate required fields
    if (!taskId) {
      throw new BadRequestException('Missing required field: taskId');
    }

    if (!status) {
      throw new BadRequestException('Missing required field: status');
    }

    // Validate status is a valid TaskStatus enum value
    if (!Object.values(TaskStatus).includes(status)) {
      throw new BadRequestException(
        `Invalid status value: ${status}. Valid values: ${Object.values(TaskStatus).join(', ')}`,
      );
    }

    // Update task status with proper error handling
    try {
      const task = await this.tasksService.updateStatus(taskId, status);

      return {
        success: true,
        taskId: task.id,
        newStatus: task.status,
        processedAt: new Date().toISOString(),
      };
    } catch (error) {
      // If task not found, don't retry
      if (error instanceof NotFoundException) {
        this.logger.warn(`Task ${taskId} not found in job ${job.id}`);
        throw error;
      }

      // For other errors, allow retry
      this.logger.error(
        `Failed to update task ${taskId} status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async handleOverdueTasks(job: Job<OverdueTasksNotificationData>): Promise<unknown> {
    const { taskIds, batchSize = 100 } = job.data || {};

    this.logger.log(`Processing overdue tasks notification (job ${job.id})`);

    // If specific task IDs are provided, process them
    if (taskIds && Array.isArray(taskIds) && taskIds.length > 0) {
      return await this.processOverdueTaskBatch(taskIds, batchSize);
    }

    // Otherwise, this should be handled by the scheduled service
    // This job type is typically triggered by the scheduled task service
    this.logger.warn(
      `Overdue tasks notification job ${job.id} received without task IDs. This should be handled by scheduled service.`,
    );

    return {
      success: true,
      message: 'Overdue tasks notification processed (no specific tasks provided)',
      processedAt: new Date().toISOString(),
    };
  }

  private async processOverdueTaskBatch(taskIds: string[], batchSize: number): Promise<unknown> {
    const results = {
      total: taskIds.length,
      processed: 0,
      failed: 0,
      errors: [] as Array<{ taskId: string; error: string }>,
    };

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < taskIds.length; i += batchSize) {
      const batch = taskIds.slice(i, i + batchSize);
      this.logger.debug(
        `Processing overdue tasks batch ${Math.floor(i / batchSize) + 1} (${batch.length} tasks)`,
      );

      // Process batch concurrently (with limit)
      const batchPromises = batch.map(async taskId => {
        try {
          // Update task to mark as overdue (could also update status or add notification)
          await this.tasksService.updateStatus(taskId, TaskStatus.PENDING); // Or create a separate method
          results.processed++;
          return { taskId, success: true };
        } catch (error) {
          results.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({ taskId, error: errorMessage });
          this.logger.warn(`Failed to process overdue task ${taskId}: ${errorMessage}`);
          return { taskId, success: false, error: errorMessage };
        }
      });

      await Promise.all(batchPromises);
    }

    this.logger.log(
      `Overdue tasks batch processing completed: ${results.processed} processed, ${results.failed} failed out of ${results.total} total`,
    );

    return {
      success: results.failed === 0,
      ...results,
      processedAt: new Date().toISOString(),
    };
  }
}
