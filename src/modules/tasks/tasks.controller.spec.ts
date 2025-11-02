import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { BatchTaskDto } from './dto/batch-task.dto';
import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CacheService } from '../../common/services/cache.service';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

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

  const mockTasksService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getStats: jest.fn(),
    batchComplete: jest.fn(),
    batchDelete: jest.fn(),
  };

  const mockCacheService = {
    increment: jest.fn(),
    getTTL: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({
        canActivate: jest.fn().mockResolvedValue(true),
      })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockResolvedValue(true),
      })
      .compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createTaskDto: CreateTaskDto = {
      title: 'New Task',
      description: 'Task Description',
      userId: 'user-123',
    };

    it('should create a task', async () => {
      mockTasksService.create.mockResolvedValue(mockTask);

      const result = await controller.create(createTaskDto);

      expect(service.create).toHaveBeenCalledWith(createTaskDto);
      expect(result).toEqual(mockTask);
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks', async () => {
      const mockResponse = {
        data: [mockTask],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      mockTasksService.findAll.mockResolvedValue(mockResponse);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should pass filter DTO to service', async () => {
      const filterDto = { status: TaskStatus.PENDING, page: 2, limit: 20 };
      const mockResponse = {
        data: [],
        meta: {
          total: 0,
          page: 2,
          limit: 20,
          totalPages: 0,
        },
      };

      mockTasksService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(filterDto);

      expect(service.findAll).toHaveBeenCalledWith(filterDto);
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      mockTasksService.findOne.mockResolvedValue(mockTask);

      const result = await controller.findOne(mockTask.id);

      expect(service.findOne).toHaveBeenCalledWith(mockTask.id);
      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundException when task not found', async () => {
      mockTasksService.findOne.mockRejectedValue(
        new NotFoundException('Task with ID non-existent-id not found'),
      );

      await expect(controller.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateTaskDto: UpdateTaskDto = {
      title: 'Updated Task',
      status: TaskStatus.IN_PROGRESS,
    };

    it('should update a task', async () => {
      const updatedTask = { ...mockTask, ...updateTaskDto };
      mockTasksService.update.mockResolvedValue(updatedTask);

      const result = await controller.update(mockTask.id, updateTaskDto);

      expect(service.update).toHaveBeenCalledWith(mockTask.id, updateTaskDto);
      expect(result).toEqual(updatedTask);
    });

    it('should throw NotFoundException when task not found', async () => {
      mockTasksService.update.mockRejectedValue(
        new NotFoundException('Task with ID non-existent-id not found'),
      );

      await expect(controller.update('non-existent-id', updateTaskDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a task', async () => {
      mockTasksService.remove.mockResolvedValue(undefined);

      await controller.remove(mockTask.id);

      expect(service.remove).toHaveBeenCalledWith(mockTask.id);
    });

    it('should throw NotFoundException when task not found', async () => {
      mockTasksService.remove.mockRejectedValue(
        new NotFoundException('Task with ID non-existent-id not found'),
      );

      await expect(controller.remove('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return task statistics', async () => {
      const mockStats = {
        total: 10,
        completed: 5,
        inProgress: 3,
        pending: 2,
        highPriority: 4,
      };

      mockTasksService.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(service.getStats).toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });
  });

  describe('batchProcess', () => {
    const batchTaskDto: BatchTaskDto = {
      tasks: ['task-1', 'task-2', 'task-3'],
      action: 'complete',
    };

    it('should process batch complete action', async () => {
      const mockResult = { success: 3, failed: 0 };
      mockTasksService.batchComplete.mockResolvedValue(mockResult);

      const result = await controller.batchProcess(batchTaskDto);

      expect(service.batchComplete).toHaveBeenCalledWith(batchTaskDto.tasks);
      expect(result).toEqual(mockResult);
    });

    it('should process batch delete action', async () => {
      const batchDto: BatchTaskDto = {
        tasks: ['task-1', 'task-2'],
        action: 'delete',
      };
      const mockResult = { success: 2, failed: 0 };
      mockTasksService.batchDelete.mockResolvedValue(mockResult);

      const result = await controller.batchProcess(batchDto);

      expect(service.batchDelete).toHaveBeenCalledWith(batchDto.tasks);
      expect(result).toEqual(mockResult);
    });

    it('should throw BadRequestException for invalid action', async () => {
      const invalidDto: BatchTaskDto = {
        tasks: ['task-1'],
        action: 'invalid-action' as any,
      };

      await expect(controller.batchProcess(invalidDto)).rejects.toThrow(BadRequestException);
    });
  });
});
