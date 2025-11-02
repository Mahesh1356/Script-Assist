import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';

describe('TasksService', () => {
  let service: TasksService;
  let _repository: Repository<Task>;
  let _queue: Queue;
  let _dataSource: DataSource;
  let _queryRunner: QueryRunner;

  const mockTask: Task = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    dueDate: new Date('2024-12-31'),
    userId: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Task;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
    addBulk: jest.fn(),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn() as jest.Mock,
      findOne: jest.fn() as jest.Mock,
      update: jest.fn() as jest.Mock,
      merge: jest.fn() as jest.Mock,
    },
  } as unknown as QueryRunner;

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockRepository,
        },
        {
          provide: getQueueToken('task-processing'),
          useValue: mockQueue,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    _repository = module.get<Repository<Task>>(getRepositoryToken(Task));
    _queue = module.get<Queue>(getQueueToken('task-processing'));
    _dataSource = module.get<DataSource>(DataSource);
    _queryRunner = mockQueryRunner;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createTaskDto: CreateTaskDto = {
      title: 'New Task',
      description: 'Task Description',
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
      userId: 'user-123',
    };

    it('should create a task successfully', async () => {
      const createdTask = { ...mockTask, ...createTaskDto } as Task;
      mockRepository.create.mockReturnValue(createdTask);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(createdTask);
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      const result = await service.create(createTaskDto);

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalledWith(createTaskDto);
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(Task, createdTask);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('task-status-update', {
        taskId: createdTask.id,
        status: createdTask.status,
      });
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(result).toEqual(createdTask);
    });

    it('should handle queue error gracefully', async () => {
      const createdTask = { ...mockTask, ...createTaskDto } as Task;
      mockRepository.create.mockReturnValue(createdTask);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(createdTask);
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      const result = await service.create(createTaskDto);

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
      expect(result).toEqual(createdTask); // Task should still be created
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('Database error');
      mockRepository.create.mockReturnValue({ ...mockTask, ...createTaskDto } as Task);
      (mockQueryRunner.manager.save as jest.Mock).mockRejectedValue(error);

      await expect(service.create(createTaskDto)).rejects.toThrow('Database error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne(mockTask.id);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockTask.id },
        relations: ['user'],
      });
      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundException when task not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        'Task with ID non-existent-id not found',
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks with default pagination', async () => {
      const mockTasks = [mockTask];
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockTasks, 1]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll();

      expect(result.data).toEqual(mockTasks);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });

    it('should apply filters correctly', async () => {
      const filterDto: TaskFilterDto = {
        status: TaskStatus.PENDING,
        priority: TaskPriority.HIGH,
        page: 2,
        limit: 20,
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAll(filterDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.status = :status', {
        status: TaskStatus.PENDING,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.priority = :priority', {
        priority: TaskPriority.HIGH,
      });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });

    it('should handle search filter', async () => {
      const filterDto: TaskFilterDto = {
        search: 'test',
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAll(filterDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(task.title ILIKE :search OR task.description ILIKE :search)',
        { search: '%test%' },
      );
    });
  });

  describe('update', () => {
    const updateTaskDto: UpdateTaskDto = {
      title: 'Updated Task',
      status: TaskStatus.IN_PROGRESS,
    };

    it('should update a task successfully', async () => {
      const existingTask = { ...mockTask } as Task;
      const updatedTask = { ...existingTask, ...updateTaskDto } as Task;

      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(existingTask);
      (mockQueryRunner.manager.merge as jest.Mock).mockReturnValue(updatedTask);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(updatedTask);
      mockRepository.findOne.mockResolvedValue(updatedTask);

      await service.update(mockTask.id, updateTaskDto);

      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(Task, {
        where: { id: mockTask.id },
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('task-status-update', {
        taskId: updatedTask.id,
        status: TaskStatus.IN_PROGRESS,
      });
    });

    it('should throw NotFoundException when task not found', async () => {
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.update('non-existent-id', updateTaskDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should not add to queue if status did not change', async () => {
      const existingTask = { ...mockTask } as Task;
      const updateDto: UpdateTaskDto = { title: 'Updated Title' };

      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(existingTask);
      (mockQueryRunner.manager.merge as jest.Mock).mockReturnValue({
        ...existingTask,
        ...updateDto,
      });
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue({
        ...existingTask,
        ...updateDto,
      });
      mockRepository.findOne.mockResolvedValue({ ...existingTask, ...updateDto } as Task);

      await service.update(mockTask.id, updateDto);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a task successfully', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove(mockTask.id);

      expect(mockRepository.delete).toHaveBeenCalledWith(mockTask.id);
    });

    it('should throw NotFoundException when task not found', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('non-existent-id')).rejects.toThrow(NotFoundException);
      await expect(service.remove('non-existent-id')).rejects.toThrow(
        'Task with ID non-existent-id not found',
      );
    });
  });

  describe('updateStatus', () => {
    it('should update task status', async () => {
      const updatedTask = { ...mockTask, status: TaskStatus.COMPLETED } as Task;
      mockRepository.findOne.mockResolvedValue(mockTask as Task);
      mockRepository.save.mockResolvedValue(updatedTask);

      const result = await service.updateStatus(mockTask.id, TaskStatus.COMPLETED);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockTask.id },
        relations: ['user'],
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.status).toBe(TaskStatus.COMPLETED);
    });
  });

  describe('batchComplete', () => {
    const taskIds = ['task-1', 'task-2', 'task-3'];

    it('should complete multiple tasks in batch', async () => {
      (mockQueryRunner.manager.update as jest.Mock).mockResolvedValue({ affected: 3 });
      mockQueue.addBulk.mockResolvedValue([]);

      const result = await service.batchComplete(taskIds);

      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        Task,
        { id: expect.any(Object) },
        { status: TaskStatus.COMPLETED },
      );
      expect(mockQueue.addBulk).toHaveBeenCalled();
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should handle partial failures', async () => {
      (mockQueryRunner.manager.update as jest.Mock).mockResolvedValue({ affected: 2 });
      mockQueue.addBulk.mockResolvedValue([]);

      const result = await service.batchComplete(taskIds);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should rollback on error', async () => {
      const error = new Error('Update failed');
      (mockQueryRunner.manager.update as jest.Mock).mockRejectedValue(error);

      await expect(service.batchComplete(taskIds)).rejects.toThrow('Update failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('batchDelete', () => {
    const taskIds = ['task-1', 'task-2'];

    it('should delete multiple tasks in batch', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 2 });

      const result = await service.batchDelete(taskIds);

      expect(mockRepository.delete).toHaveBeenCalled();
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle partial deletions', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.batchDelete(taskIds);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return task statistics', async () => {
      const mockStats = {
        total: '10',
        completed: '5',
        in_progress: '3',
        pending: '2',
        high_priority: '4',
      };

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(mockStats),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getStats();

      expect(result.total).toBe(10);
      expect(result.completed).toBe(5);
      expect(result.inProgress).toBe(3);
      expect(result.pending).toBe(2);
      expect(result.highPriority).toBe(4);
    });
  });
});
