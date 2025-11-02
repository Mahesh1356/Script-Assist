import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { PaginatedResponse } from '../../types/pagination.interface';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = this.tasksRepository.create(createTaskDto);
      const savedTask = await queryRunner.manager.save(Task, task);

      // Commit transaction first
      await queryRunner.commitTransaction();

      // Add to queue after successful commit with error handling
      try {
        await this.taskQueue.add('task-status-update', {
          taskId: savedTask.id,
          status: savedTask.status,
        });
      } catch (queueError) {
        // Log queue error but don't fail the request since task is already saved
        this.logger.error(
          `Failed to add task ${savedTask.id} to queue: ${queueError instanceof Error ? queueError.message : 'Unknown error'}`,
        );
      }

      return savedTask;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(filterDto?: TaskFilterDto): Promise<PaginatedResponse<Task>> {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      userId,
      search,
      dueDateFrom,
      dueDateTo,
      createdAtFrom,
      createdAtTo,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filterDto || {};

    const queryBuilder = this.tasksRepository.createQueryBuilder('task');

    // Join user relation
    queryBuilder.leftJoinAndSelect('task.user', 'user');

    // Apply filters
    if (status) {
      queryBuilder.andWhere('task.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority });
    }

    if (userId) {
      queryBuilder.andWhere('task.userId = :userId', { userId });
    }

    if (search) {
      queryBuilder.andWhere('(task.title ILIKE :search OR task.description ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (dueDateFrom || dueDateTo) {
      if (dueDateFrom && dueDateTo) {
        queryBuilder.andWhere('task.dueDate BETWEEN :dueDateFrom AND :dueDateTo', {
          dueDateFrom,
          dueDateTo,
        });
      } else if (dueDateFrom) {
        queryBuilder.andWhere('task.dueDate >= :dueDateFrom', { dueDateFrom });
      } else if (dueDateTo) {
        queryBuilder.andWhere('task.dueDate <= :dueDateTo', { dueDateTo });
      }
    }

    if (createdAtFrom || createdAtTo) {
      if (createdAtFrom && createdAtTo) {
        queryBuilder.andWhere('task.createdAt BETWEEN :createdAtFrom AND :createdAtTo', {
          createdAtFrom,
          createdAtTo,
        });
      } else if (createdAtFrom) {
        queryBuilder.andWhere('task.createdAt >= :createdAtFrom', { createdAtFrom });
      } else if (createdAtTo) {
        queryBuilder.andWhere('task.createdAt <= :createdAtTo', { createdAtTo });
      }
    }

    // Apply sorting - validate sortBy to prevent SQL injection
    const allowedSortFields = ['createdAt', 'updatedAt', 'dueDate', 'title', 'priority', 'status'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const validSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    queryBuilder.orderBy(`task.${validSortBy}`, validSortOrder);

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Get total count and data
    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Task> {
    // Single database call with proper error handling
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    // Use transaction for atomic update
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await queryRunner.manager.findOne(Task, {
        where: { id },
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus = task.status;

      // Use merge for cleaner update
      queryRunner.manager.merge(Task, task, updateTaskDto);
      const updatedTask = await queryRunner.manager.save(Task, task);

      await queryRunner.commitTransaction();

      // Add to queue if status changed, with error handling
      if (originalStatus !== updatedTask.status) {
        try {
          await this.taskQueue.add('task-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        } catch (queueError) {
          this.logger.error(
            `Failed to add status update to queue for task ${updatedTask.id}: ${queueError instanceof Error ? queueError.message : 'Unknown error'}`,
          );
        }
      }

      // Reload with relations
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to update task ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<void> {
    // Single database call with existence check
    const result = await this.tasksRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Use proper repository patterns instead of raw SQL
    return this.tasksRepository.find({
      where: { status },
      relations: ['user'],
    });
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status;
    return this.tasksRepository.save(task);
  }

  async getStats(): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    highPriority: number;
  }> {
    // Use SQL aggregation for efficient computation
    const result = await this.tasksRepository
      .createQueryBuilder('task')
      .select([
        'COUNT(*) as total',
        `SUM(CASE WHEN task.status = '${TaskStatus.COMPLETED}' THEN 1 ELSE 0 END) as completed`,
        `SUM(CASE WHEN task.status = '${TaskStatus.IN_PROGRESS}' THEN 1 ELSE 0 END) as in_progress`,
        `SUM(CASE WHEN task.status = '${TaskStatus.PENDING}' THEN 1 ELSE 0 END) as pending`,
        `SUM(CASE WHEN task.priority = 'HIGH' THEN 1 ELSE 0 END) as high_priority`,
      ])
      .getRawOne();

    return {
      total: parseInt(result.total, 10) || 0,
      completed: parseInt(result.completed, 10) || 0,
      inProgress: parseInt(result.in_progress, 10) || 0,
      pending: parseInt(result.pending, 10) || 0,
      highPriority: parseInt(result.high_priority, 10) || 0,
    };
  }

  async batchComplete(taskIds: string[]): Promise<{ success: number; failed: number }> {
    // Use bulk update for efficiency
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await queryRunner.manager.update(
        Task,
        { id: In(taskIds) },
        { status: TaskStatus.COMPLETED },
      );

      await queryRunner.commitTransaction();

      // Add batch jobs to queue using addBulk for better performance
      if (taskIds.length > 0) {
        try {
          const jobs = taskIds.map(taskId => ({
            name: 'task-status-update',
            data: {
              taskId,
              status: TaskStatus.COMPLETED,
            },
          }));

          await this.taskQueue.addBulk(jobs);
          this.logger.debug(`Successfully queued ${taskIds.length} status update jobs in bulk`);
        } catch (queueError) {
          // Log bulk error but continue - database update already succeeded
          this.logger.error(
            `Failed to add batch completion jobs to queue: ${queueError instanceof Error ? queueError.message : 'Unknown error'}`,
          );
        }
      }

      return {
        success: result.affected || 0,
        failed: taskIds.length - (result.affected || 0),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to batch complete tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async batchDelete(taskIds: string[]): Promise<{ success: number; failed: number }> {
    // Use bulk delete for efficiency
    const result = await this.tasksRepository.delete({ id: In(taskIds) });

    return {
      success: result.affected || 0,
      failed: taskIds.length - (result.affected || 0),
    };
  }
}
