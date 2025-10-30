import { ApiProperty } from '@nestjs/swagger';
import { UserResponse } from '../interfaces/auth.interface';

export class TokenResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  access_token: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refresh_token: string;
}

export class AuthResponseDto extends TokenResponseDto {
  @ApiProperty({ type: 'object', description: 'User information' })
  user: UserResponse;
}

export class LoginResponseDto extends AuthResponseDto {}

export class RegisterResponseDto extends AuthResponseDto {}
