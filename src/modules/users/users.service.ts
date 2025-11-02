import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginatedResponse, PaginationOptions } from '../../types/pagination.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if user with email already exists
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException(`User with email ${createUserDto.email} already exists`);
    }

    // Use transaction for atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
      const user = this.usersRepository.create({
        ...createUserDto,
        password: hashedPassword,
      });

      const savedUser = await queryRunner.manager.save(User, user);
      await queryRunner.commitTransaction();

      this.logger.log(`User created successfully: ${savedUser.email}`);
      return savedUser;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      // Check for unique constraint violation
      if (error instanceof Error && error.message.includes('unique')) {
        throw new ConflictException(`User with email ${createUserDto.email} already exists`);
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(options?: PaginationOptions): Promise<PaginatedResponse<User>> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC' } = options || {};

    const queryBuilder = this.usersRepository.createQueryBuilder('user');

    // Apply sorting - validate to prevent SQL injection
    const allowedSortFields = ['createdAt', 'updatedAt', 'email', 'name'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const validSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    queryBuilder.orderBy(`user.${validSortBy}`, validSortOrder);

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Exclude password from results
    queryBuilder.select([
      'user.id',
      'user.email',
      'user.name',
      'user.role',
      'user.createdAt',
      'user.updatedAt',
    ]);

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

  async findOne(id: string): Promise<User> {
    if (!id) {
      throw new BadRequestException('User ID is required');
    }

    const user = await this.usersRepository.findOne({
      where: { id },
      select: ['id', 'email', 'name', 'role', 'createdAt', 'updatedAt'], // Exclude password
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    if (!email) {
      return null;
    }

    return this.usersRepository.findOne({
      where: { email },
      select: ['id', 'email', 'name', 'password', 'role', 'createdAt', 'updatedAt'], // Include password for auth checks
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    // Use transaction for atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      // Check if email is being updated and if it conflicts with existing user
      if (updateUserDto.email && updateUserDto.email !== user.email) {
        const existingUser = await this.findByEmail(updateUserDto.email);
        if (existingUser && existingUser.id !== id) {
          throw new ConflictException(`User with email ${updateUserDto.email} already exists`);
        }
      }

      // Hash password if being updated
      if (updateUserDto.password) {
        updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
      }

      queryRunner.manager.merge(User, user, updateUserDto);
      const updatedUser = await queryRunner.manager.save(User, user);
      await queryRunner.commitTransaction();

      this.logger.log(`User updated successfully: ${updatedUser.id}`);

      // Return user without password
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to update user ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<void> {
    // Single database call with existence check
    const result = await this.usersRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    this.logger.log(`User deleted successfully: ${id}`);
  }
}
