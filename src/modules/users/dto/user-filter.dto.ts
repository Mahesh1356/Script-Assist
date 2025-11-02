import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class UserFilterDto {
  @ApiProperty({
    example: 1,
    required: false,
    default: 1,
    description: 'Page number',
  })
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
