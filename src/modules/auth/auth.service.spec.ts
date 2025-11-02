import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { TokenService } from './services/token.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let _usersService: UsersService;
  let _tokenService: TokenService;
  let _refreshTokenService: RefreshTokenService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    password: 'hashedpassword',
    role: 'user',
  };

  const mockAuthUser = {
    id: mockUser.id,
    email: mockUser.email,
    name: mockUser.name,
    role: mockUser.role,
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
  };

  const mockTokenService = {
    generateAccessToken: jest.fn(),
  };

  const mockRefreshTokenService = {
    generateRefreshToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: {},
        },
        {
          provide: TokenService,
          useValue: mockTokenService,
        },
        {
          provide: RefreshTokenService,
          useValue: mockRefreshTokenService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    _usersService = module.get<UsersService>(UsersService);
    _tokenService = module.get<TokenService>(TokenService);
    _refreshTokenService = module.get<RefreshTokenService>(RefreshTokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should login user successfully', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockTokenService.generateAccessToken.mockReturnValue('access-token');
      mockRefreshTokenService.generateRefreshToken.mockReturnValue('refresh-token');

      const result = await service.login(loginDto);

      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUser.password);
      expect(mockTokenService.generateAccessToken).toHaveBeenCalledWith(mockAuthUser);
      expect(mockRefreshTokenService.generateRefreshToken).toHaveBeenCalledWith(mockUser.id);
      expect(result.access_token).toBe('access-token');
      expect(result.refresh_token).toBe('refresh-token');
      expect(result.user).toEqual(mockAuthUser);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid credentials');
      expect(compareSpy).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'new@example.com',
      name: 'New User',
      password: 'password123',
    };

    it('should register user successfully', async () => {
      const newUser = { ...mockUser, ...registerDto, id: 'new-user-id' };
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(newUser);
      mockTokenService.generateAccessToken.mockReturnValue('access-token');
      mockRefreshTokenService.generateRefreshToken.mockReturnValue('refresh-token');

      const result = await service.register(registerDto);

      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(mockUsersService.create).toHaveBeenCalledWith(registerDto);
      expect(mockTokenService.generateAccessToken).toHaveBeenCalled();
      expect(mockRefreshTokenService.generateRefreshToken).toHaveBeenCalledWith(newUser.id);
      expect(result.access_token).toBe('access-token');
      expect(result.refresh_token).toBe('refresh-token');
      expect(result.user).toBeDefined();
    });

    it('should throw ConflictException if email already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toThrow('Email already exists');
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });
  });

  describe('validateUser', () => {
    it('should return auth user if user exists', async () => {
      const { password: _password, ...userWithoutPassword } = mockUser;
      mockUsersService.findOne.mockResolvedValue(userWithoutPassword);

      const result = await service.validateUser(mockUser.id);

      expect(mockUsersService.findOne).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockAuthUser);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findOne.mockRejectedValue(new UnauthorizedException('User not found'));

      await expect(service.validateUser('non-existent-id')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should generate new tokens successfully', async () => {
      const { password: _password, ...userWithoutPassword } = mockUser;
      mockUsersService.findOne.mockResolvedValue(userWithoutPassword);
      mockTokenService.generateAccessToken.mockReturnValue('new-access-token');
      mockRefreshTokenService.generateRefreshToken.mockReturnValue('new-refresh-token');

      const result = await service.refreshToken(mockUser.id);

      expect(mockUsersService.findOne).toHaveBeenCalledWith(mockUser.id);
      expect(mockTokenService.generateAccessToken).toHaveBeenCalledWith(mockAuthUser);
      expect(mockRefreshTokenService.generateRefreshToken).toHaveBeenCalledWith(mockUser.id);
      expect(result.access_token).toBe('new-access-token');
      expect(result.refresh_token).toBe('new-refresh-token');
    });
  });
});
