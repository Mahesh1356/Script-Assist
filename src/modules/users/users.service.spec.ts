import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;
  let _repository: Repository<User>;
  let _dataSource: DataSource;
  let _queryRunner: QueryRunner;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    name: 'Test User',
    password: 'hashedpassword',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    tasks: [],
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
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
      merge: jest.fn() as jest.Mock,
    },
  } as unknown as QueryRunner;

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    _repository = module.get<Repository<User>>(getRepositoryToken(User));
    _dataSource = module.get<DataSource>(DataSource);
    _queryRunner = mockQueryRunner;

    // Mock bcrypt
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedpassword' as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createUserDto: CreateUserDto = {
      email: 'new@example.com',
      name: 'New User',
      password: 'password123',
    };

    it('should create a user successfully', async () => {
      const createdUser = { ...mockUser, ...createUserDto };
      mockRepository.findOne.mockResolvedValue(null); // findByEmail returns null
      mockRepository.create.mockReturnValue(createdUser);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(createdUser);

      const result = await service.create(createUserDto);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: createUserDto.email },
        select: expect.any(Array),
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(result).toEqual(createdUser);
    });

    it('should throw ConflictException if user already exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser); // User exists

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createUserDto)).rejects.toThrow(
        `User with email ${createUserDto.email} already exists`,
      );
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('Database error');
      mockRepository.findOne.mockResolvedValue(null);
      (mockQueryRunner.manager.save as jest.Mock).mockRejectedValue(error);

      await expect(service.create(createUserDto)).rejects.toThrow('Database error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should handle unique constraint violation', async () => {
      const error = new Error('unique constraint violation');
      error.message = 'unique constraint';
      mockRepository.findOne.mockResolvedValue(null);
      (mockQueryRunner.manager.save as jest.Mock).mockRejectedValue(error);

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      const { password: _password, ...userWithoutPassword } = mockUser;

      mockRepository.findOne.mockResolvedValue(userWithoutPassword);

      const result = await service.findOne(mockUser.id);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: expect.any(Array),
      });
      expect(result.password).toBeUndefined();
      expect(result.id).toBe(mockUser.id);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        'User with ID non-existent-id not found',
      );
    });

    it('should throw BadRequestException when id is empty', async () => {
      await expect(service.findOne('')).rejects.toThrow(BadRequestException);
      await expect(service.findOne('')).rejects.toThrow('User ID is required');
    });
  });

  describe('findByEmail', () => {
    it('should return a user by email', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: expect.any(Array),
      });
      expect(result).toEqual(mockUser);
      if (result) {
        expect(result.password).toBeDefined(); // Should include password for auth checks
      }
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should return null when email is empty', async () => {
      const result = await service.findByEmail('');

      expect(result).toBeNull();
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated users with default pagination', async () => {
      const mockUsers = [{ ...mockUser, password: undefined }];
      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockUsers, 1]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll();

      expect(result.data).toEqual(mockUsers);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.data[0].password).toBeUndefined();
    });

    it('should apply pagination options correctly', async () => {
      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAll({ page: 2, limit: 20, sortBy: 'email', sortOrder: 'ASC' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('user.email', 'ASC');
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });
  });

  describe('update', () => {
    const updateUserDto: UpdateUserDto = {
      name: 'Updated Name',
      email: 'updated@example.com',
    };

    it('should update a user successfully', async () => {
      const existingUser = { ...mockUser };
      const updatedUser = { ...existingUser, ...updateUserDto };

      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(existingUser);
      mockRepository.findOne.mockResolvedValue(null); // Email check returns null
      (mockQueryRunner.manager.merge as jest.Mock).mockReturnValue(updatedUser);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(updatedUser);
      mockRepository.findOne.mockResolvedValue(updatedUser); // For final findOne call

      const result = await service.update(mockUser.id, updateUserDto);

      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(User, {
        where: { id: mockUser.id },
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(result.name).toBe('Updated Name');
    });

    it('should hash password if provided in update', async () => {
      const updateDto: UpdateUserDto = {
        password: 'newpassword123',
      };

      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockQueryRunner.manager.merge as jest.Mock).mockReturnValue({
        ...mockUser,
        ...updateDto,
      });
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue({
        ...mockUser,
        ...updateDto,
      });
      mockRepository.findOne.mockResolvedValue({ ...mockUser, ...updateDto });

      await service.update(mockUser.id, updateDto);

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
    });

    it('should throw NotFoundException when user not found', async () => {
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.update('non-existent-id', updateUserDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const existingUserWithEmail = { ...mockUser, id: 'different-id' };
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(mockUser);
      mockRepository.findOne.mockResolvedValue(existingUserWithEmail); // Email exists for different user

      await expect(service.update(mockUser.id, updateUserDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should delete a user successfully', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove(mockUser.id);

      expect(mockRepository.delete).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('non-existent-id')).rejects.toThrow(NotFoundException);
      await expect(service.remove('non-existent-id')).rejects.toThrow(
        'User with ID non-existent-id not found',
      );
    });
  });
});
