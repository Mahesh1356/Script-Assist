import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenService } from './services/token.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { LoginResponse, RegisterResponse, AuthUser } from './interfaces/auth.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tokenService: TokenService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const accessToken = this.tokenService.generateAccessToken(authUser);
    const refreshToken = this.refreshTokenService.generateRefreshToken(authUser.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: authUser,
    };
  }

  async register(registerDto: RegisterDto): Promise<RegisterResponse> {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) throw new ConflictException('Email already exists');

    const user = await this.usersService.create(registerDto);

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const accessToken = this.tokenService.generateAccessToken(authUser);
    const refreshToken = this.refreshTokenService.generateRefreshToken(authUser.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: authUser,
    };
  }

  async validateUser(userId: string): Promise<AuthUser | null> {
    const user = await this.usersService.findOne(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async refreshToken(userId: string): Promise<{ access_token: string; refresh_token: string }> {
    const user = await this.validateUser(userId);

    const authUser: AuthUser = {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
    };

    return {
      access_token: this.tokenService.generateAccessToken(authUser),
      refresh_token: this.refreshTokenService.generateRefreshToken(authUser.id),
    };
  }
}
