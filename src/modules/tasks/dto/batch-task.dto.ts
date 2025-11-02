import { IsArray, IsEnum, IsNotEmpty, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BatchTaskDto {
  @ApiProperty({
    example: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
    description: 'Array of task IDs to process',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one task ID is required' })
  @IsUUID('4', { each: true, message: 'Each task ID must be a valid UUID' })
  tasks: string[];

  @ApiProperty({
    enum: ['complete', 'delete'],
    example: 'complete',
    description: 'Action to perform on the tasks',
  })
  @IsEnum(['complete', 'delete'], { message: 'Action must be either "complete" or "delete"' })
  @IsNotEmpty()
  action: 'complete' | 'delete';
}
