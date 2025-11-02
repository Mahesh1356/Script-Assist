import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

export class TaskFilterDto {
  @ApiProperty({ enum: TaskStatus, required: false, description: 'Filter by task status' })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({ enum: TaskPriority, required: false, description: 'Filter by task priority' })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
    description: 'Filter by user ID',
  })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiProperty({
    example: 'project documentation',
    required: false,
    description: 'Search in title and description',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({
    example: '2023-01-01T00:00:00.000Z',
    required: false,
    description: 'Filter by due date from',
  })
  @IsDateString()
  @IsOptional()
  dueDateFrom?: string;

  @ApiProperty({
    example: '2023-12-31T23:59:59.000Z',
    required: false,
    description: 'Filter by due date to',
  })
  @IsDateString()
  @IsOptional()
  dueDateTo?: string;

  @ApiProperty({
    example: '2023-01-01T00:00:00.000Z',
    required: false,
    description: 'Filter by created date from',
  })
  @IsDateString()
  @IsOptional()
  createdAtFrom?: string;

  @ApiProperty({
    example: '2023-12-31T23:59:59.000Z',
    required: false,
    description: 'Filter by created date to',
  })
  @IsDateString()
  @IsOptional()
  createdAtTo?: string;

  @ApiProperty({ example: 1, required: false, default: 1, description: 'Page number' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiProperty({
    example: 10,
    required: false,
    default: 10,
    description: 'Number of items per page',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiProperty({
    example: 'createdAt',
    required: false,
    default: 'createdAt',
    description: 'Field to sort by',
  })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiProperty({
    enum: ['ASC', 'DESC'],
    required: false,
    default: 'DESC',
    description: 'Sort order',
  })
  @IsString()
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC';
}
