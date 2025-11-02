import { Body, Controller, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginResponseDto, RegisterResponseDto, TokenResponseDto } from './dto/auth-response.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiBody,
} from '@nestjs/swagger';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RATE_LIMIT_CONSTANTS } from '../../common/constants/rate-limit.constants';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './interfaces/auth.interface';

@ApiTags('auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
@RateLimit({
  limit: RATE_LIMIT_CONSTANTS.AUTH_LIMIT,
  windowMs: RATE_LIMIT_CONSTANTS.AUTH_WINDOW_MS,
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    limit: RATE_LIMIT_CONSTANTS.LOGIN_LIMIT,
    windowMs: RATE_LIMIT_CONSTANTS.LOGIN_WINDOW_MS,
  })
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({
    limit: RATE_LIMIT_CONSTANTS.REGISTER_LIMIT,
    windowMs: RATE_LIMIT_CONSTANTS.REGISTER_WINDOW_MS,
  })
  @ApiOperation({ summary: 'User registration' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: RegisterResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data or weak password' })
  @ApiConflictResponse({ description: 'Email already exists' })
  async register(@Body() registerDto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    limit: RATE_LIMIT_CONSTANTS.REFRESH_TOKEN_LIMIT,
    windowMs: RATE_LIMIT_CONSTANTS.REFRESH_TOKEN_WINDOW_MS,
  })
  @UseGuards(RefreshTokenGuard)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: TokenResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  async refreshToken(
    @CurrentUser() user: AuthUser,
  ): Promise<{ access_token: string; refresh_token: string }> {
    return this.authService.refreshToken(user.id);
  }
}
