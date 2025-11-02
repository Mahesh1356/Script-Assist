import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { OVERDUE_TASKS_CONSTANTS, QUEUE_JOB_OPTIONS } from '../constants/queue.constants';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private readonly BATCH_SIZE = OVERDUE_TASKS_CONSTANTS.BATCH_SIZE;
  private readonly MAX_TASKS_PER_RUN = OVERDUE_TASKS_CONSTANTS.MAX_TASKS_PER_RUN;

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {}

  /**
   * Check for overdue tasks every hour
   * Finds tasks with due date in the past that are not completed
   * and adds them to the processing queue in batches
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('Starting overdue tasks check...');

    try {
      const now = new Date();

      // Find all overdue tasks that are not completed
      // Using query builder for better performance with large datasets
      const queryBuilder = this.tasksRepository
        .createQueryBuilder('task')
        .where('task.dueDate < :now', { now })
        .andWhere('task.dueDate IS NOT NULL')
        .andWhere('task.status != :completedStatus', { completedStatus: TaskStatus.COMPLETED })
        .orderBy('task.dueDate', 'ASC')
        .limit(this.MAX_TASKS_PER_RUN);

      const overdueTasks = await queryBuilder.getMany();

      if (overdueTasks.length === 0) {
        this.logger.debug('No overdue tasks found');
        return;
      }

      this.logger.log(`Found ${overdueTasks.length} overdue tasks to process`);

      // Process tasks in batches to avoid overwhelming the queue
      const batches = this.chunkArray(
        overdueTasks.map(task => task.id),
        this.BATCH_SIZE,
      );
      let totalQueued = 0;

      // Use addBulk to add all batch jobs at once for better performance
      const jobOptions = QUEUE_JOB_OPTIONS;

      try {
        // Prepare all jobs for bulk insertion
        const jobs = batches.map(batch => ({
          name: 'overdue-tasks-notification',
          data: {
            taskIds: batch,
            batchSize: this.BATCH_SIZE,
            checkedAt: now.toISOString(),
          },
          opts: jobOptions,
        }));

        // Add all jobs in bulk (single Redis transaction)
        await this.taskQueue.addBulk(jobs);
        totalQueued = overdueTasks.length;

        this.logger.debug(
          `Successfully queued ${batches.length} batch jobs containing ${totalQueued} tasks in bulk`,
        );
      } catch (error) {
        // Fallback to adding one by one if bulk fails
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Bulk queue add failed, falling back to individual adds: ${errorMessage}`);

        // Fallback: add jobs one by one
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          const batchNumber = i + 1;

          try {
            await this.taskQueue.add(
              'overdue-tasks-notification',
              {
                taskIds: batch,
                batchSize: this.BATCH_SIZE,
                checkedAt: now.toISOString(),
              },
              jobOptions,
            );

            totalQueued += batch.length;
            this.logger.debug(
              `Queued batch ${batchNumber}/${batches.length} with ${batch.length} tasks`,
            );
          } catch (individualError) {
            const individualErrorMessage =
              individualError instanceof Error ? individualError.message : 'Unknown error';
            this.logger.error(
              `Failed to queue batch ${batchNumber}/${batches.length}: ${individualErrorMessage}`,
            );
            // Continue processing other batches even if one fails
          }
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Overdue tasks check completed: ${totalQueued}/${overdueTasks.length} tasks queued in ${duration}ms`,
      );

      if (overdueTasks.length > this.MAX_TASKS_PER_RUN) {
        this.logger.warn(
          `Found ${overdueTasks.length} overdue tasks but only processed ${this.MAX_TASKS_PER_RUN}. Consider adjusting MAX_TASKS_PER_RUN or running more frequently.`,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error during overdue tasks check: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Manually trigger overdue tasks check (for testing or manual runs)
   */
  async checkOverdueTasksManual(): Promise<{ found: number; queued: number }> {
    this.logger.log('Manual overdue tasks check triggered');
    const beforeCount = await this.taskQueue.getWaitingCount();

    await this.checkOverdueTasks();

    const afterCount = await this.taskQueue.getWaitingCount();
    const queued = afterCount - beforeCount;

    return { found: queued, queued };
  }

  /**
   * Helper method to chunk array into batches
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
