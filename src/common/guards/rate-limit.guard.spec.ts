import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { CacheService } from '../services/cache.service';
import { RateLimitOptions } from '../decorators/rate-limit.decorator';
import { RATE_LIMIT_CONSTANTS } from '../constants/rate-limit.constants';
import { CACHE_NAMESPACES } from '../constants/cache.constants';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let _cacheService: CacheService;
  let _reflector: Reflector;

  const mockCacheService = {
    increment: jest.fn(),
    getTTL: jest.fn(),
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const createMockExecutionContext = (request: {
    ip?: string;
    connection?: { remoteAddress?: string };
    headers: Record<string, string | string[] | undefined>;
  }): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    _cacheService = module.get<CacheService>(CacheService);
    _reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow request when rate limit not exceeded', async () => {
      const request = {
        ip: '192.168.1.1',
        headers: {},
      };
      const context = createMockExecutionContext(request);

      mockReflector.getAllAndOverride.mockReturnValue(null);
      mockCacheService.increment.mockResolvedValue(50);
      mockCacheService.getTTL.mockResolvedValue(60);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockCacheService.increment).toHaveBeenCalledWith(
        expect.any(String),
        CACHE_NAMESPACES.RATE_LIMIT,
        expect.any(Number),
      );
    });

    it('should use custom rate limit from decorator', async () => {
      const request = {
        ip: '192.168.1.1',
        headers: {},
      };
      const context = createMockExecutionContext(request);

      const customOptions: RateLimitOptions = {
        limit: 10,
        windowMs: 30000,
      };

      mockReflector.getAllAndOverride.mockReturnValue(customOptions);
      mockCacheService.increment.mockResolvedValue(5);

      await guard.canActivate(context);

      expect(mockCacheService.increment).toHaveBeenCalled();
    });

    it('should throw HttpException when rate limit exceeded', async () => {
      const request = {
        ip: '192.168.1.1',
        headers: {},
      };
      const context = createMockExecutionContext(request);

      mockReflector.getAllAndOverride.mockReturnValue(null);
      mockCacheService.increment.mockResolvedValue(101); // Exceeds default limit of 100
      mockCacheService.getTTL.mockResolvedValue(30);

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        if (error instanceof HttpException) {
          expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
          const response = error.getResponse();
          expect(response).toHaveProperty('error', 'Rate limit exceeded');
          expect(response).toHaveProperty('limit', RATE_LIMIT_CONSTANTS.DEFAULT_LIMIT);
        }
      }
    });

    it('should handle request behind proxy with x-forwarded-for header', async () => {
      const request = {
        ip: undefined,
        connection: { remoteAddress: undefined },
        headers: {
          'x-forwarded-for': '203.0.113.1, 198.51.100.1',
          'x-real-ip': undefined,
        },
      };
      const context = createMockExecutionContext(request);

      mockReflector.getAllAndOverride.mockReturnValue(null);
      mockCacheService.increment.mockResolvedValue(1);

      await guard.canActivate(context);

      expect(mockCacheService.increment).toHaveBeenCalled();
    });

    it('should handle request with array x-forwarded-for header', async () => {
      const request = {
        ip: undefined,
        connection: { remoteAddress: undefined },
        headers: {
          'x-forwarded-for': ['203.0.113.1', '198.51.100.1'],
        },
      };
      const context = createMockExecutionContext(request);

      mockReflector.getAllAndOverride.mockReturnValue(null);
      mockCacheService.increment.mockResolvedValue(1);

      await guard.canActivate(context);

      expect(mockCacheService.increment).toHaveBeenCalled();
    });

    it('should allow request on cache service error (fail-open)', async () => {
      const request = {
        ip: '192.168.1.1',
        headers: {},
      };
      const context = createMockExecutionContext(request);

      mockReflector.getAllAndOverride.mockReturnValue(null);
      mockCacheService.increment.mockRejectedValue(new Error('Redis connection failed'));

      const result = await guard.canActivate(context);

      // Should allow request on error (fail-open strategy)
      expect(result).toBe(true);
    });
  });
});
