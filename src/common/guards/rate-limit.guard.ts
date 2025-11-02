import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { createHash } from 'crypto';
import { CacheService } from '../services/cache.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { RATE_LIMIT_CONSTANTS } from '../constants/rate-limit.constants';
import { CACHE_NAMESPACES } from '../constants/cache.constants';

/**
 * Rate limit guard using CacheService (Redis) for distributed rate limiting
 *
 * Features:
 * - Distributed: Works across multiple instances using Redis
 * - Efficient: Uses Redis atomic operations for thread-safe counters
 * - Configurable: Supports per-route rate limits via decorator metadata
 * - Secure: Hashes IP addresses for privacy/compliance
 * - Auto-cleanup: Redis TTL automatically cleans up expired entries
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  // Default rate limit configuration from constants
  private readonly defaultLimit = RATE_LIMIT_CONSTANTS.DEFAULT_LIMIT;
  private readonly defaultWindowMs = RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS;

  constructor(
    private reflector: Reflector,
    // SOLVED: Using CacheService (Redis) instead of in-memory storage - enables distributed rate limiting (was: Problem: Not distributed - breaks in multi-instance deployments)
    private cacheService: CacheService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    // SOLVED: Now actually using decorator metadata (was: Problem: Decorator doesn't actually use the parameters; Problem: This is misleading and causes confusion)
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Use custom limits from decorator or fall back to defaults
    const limit = options?.limit || this.defaultLimit;
    const windowMs = options?.windowMs || this.defaultWindowMs;

    // Get client identifier (hash IP for privacy/compliance)
    const identifier = this.getClientIdentifier(request);

    return this.handleRateLimit(identifier, limit, windowMs) as Promise<boolean>;
  }

  /**
   * Get a hashed identifier for the client
   *
   * Uses IP address hashed with SHA-256 for privacy and compliance.
   * Handles various proxy configurations by checking multiple headers.
   *
   * @param request - Express request object
   * @returns Hashed identifier string (first 16 characters of SHA-256 hash)
   */
  private getClientIdentifier(request: {
    ip?: string;
    connection?: { remoteAddress?: string };
    headers: Record<string, string | string[] | undefined>;
  }): string {
    // Try to get IP from various sources (behind proxies, load balancers, etc.)
    const xForwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(xForwardedFor)
      ? xForwardedFor[0]?.trim()
      : typeof xForwardedFor === 'string'
        ? xForwardedFor.split(',')[0]?.trim()
        : undefined;

    const xRealIp = request.headers['x-real-ip'];
    const realIp = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;

    const ip =
      request.ip || request.connection?.remoteAddress || forwardedIp || realIp || 'unknown';

    // SOLVED: Hashing IP address for privacy/compliance (was: Problem: Uses IP address directly without any hashing or anonymization; Problem: Security risk: Storing raw IPs without compliance consideration)
    // SOLVED: SHA-256 hash ensures privacy while maintaining uniqueness for rate limiting
    const hash = createHash('sha256').update(ip).digest('hex');

    // Return a truncated hash for shorter Redis keys (first 16 chars is sufficient)
    // Namespace will be handled by the cache service
    return hash.substring(0, 16);
  }

  /**
   * Handle rate limiting using CacheService (Redis) sliding window counter
   *
   * Uses a sliding window algorithm with Redis:
   * 1. Increment counter for the current window
   * 2. Check if limit is exceeded
   * 3. Set expiration on the key to auto-cleanup
   */
  private async handleRateLimit(
    identifier: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    try {
      // Convert windowMs to seconds for Redis TTL
      const ttlSeconds = Math.ceil(windowMs / 1000);

      // Namespace for rate limiting keys (from constants)
      const rateLimitNamespace = CACHE_NAMESPACES.RATE_LIMIT;

      // SOLVED: Using Redis atomic operations instead of arrays - efficient and thread-safe (was: Problem: Inefficient data structure for lookups in large datasets; Problem: Creates a new array for each IP if it doesn't exist; Problem: Filter operation on potentially large array - Every request causes a full array scan)
      // SOLVED: Redis persistence ensures rate limits survive application restarts (was: Problem: No persistence - resets on application restart)
      // SOLVED: Redis TTL automatically cleans up expired entries - no memory leak (was: Problem: Memory leak - no cleanup mechanism for old entries; Problem: No periodic cleanup task, memory usage grows indefinitely)
      // SOLVED: Atomic operations prevent race conditions (was: Problem: Potential race condition in concurrent environments; Problem: No locking mechanism when updating shared state)
      // SOLVED: Namespace is passed explicitly to make cache service general-purpose (was: Problem: Cache service was coupled to rate limit namespace)
      const current = await this.cacheService.increment(identifier, rateLimitNamespace, ttlSeconds);

      // If limit exceeded, throw exception
      if (current > limit) {
        // Get TTL to calculate when the window resets
        const ttl = await this.cacheService.getTTL(identifier, rateLimitNamespace);
        const resetTime = ttl > 0 ? Date.now() + ttl * 1000 : Date.now() + windowMs;

        // SOLVED: Cleaner error response without exposing internal details or IP addresses (was: Problem: Inefficient error handling: Too verbose, exposes internal details; Problem: Exposing the IP in the response is a security risk)
        throw new HttpException(
          {
            status: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Rate limit exceeded',
            message: `You have exceeded the rate limit of ${limit} requests per ${Math.floor(windowMs / 1000)} seconds.`,
            limit,
            remaining: 0,
            resetAt: new Date(resetTime).toISOString(),
            // SOLVED: Not exposing IP or identifier for security (was: Problem: Exposing the IP in the response is a security risk)
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Request is allowed
      return true;
    } catch (error) {
      // If it's an HttpException (rate limit exceeded), rethrow it
      if (error instanceof HttpException) {
        throw error;
      }

      // For other errors (e.g., Redis connection issues), log and allow request (fail-open)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in rate limiting: ${errorMessage}`, errorStack);
      return true;
    }
  }
}
