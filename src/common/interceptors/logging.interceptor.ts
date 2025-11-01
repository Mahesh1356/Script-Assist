import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);
  private readonly sensitiveFields = [
    'password',
    'token',
    'secret',
    'authorization',
    'apikey',
    'accessToken',
    'refreshToken',
  ];

  private sanitize(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sanitize(item));

    const sanitized: Record<string, unknown> = {};
    const record = obj as Record<string, unknown>;

    for (const key in record) {
      if (!record.hasOwnProperty(key)) continue;

      const isSensitive = this.sensitiveFields.some(field =>
        key.toLowerCase().includes(field.toLowerCase()),
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof record[key] === 'object' && record[key] !== null) {
        sanitized[key] = this.sanitize(record[key]);
      } else {
        sanitized[key] = record[key];
      }
    }
    return sanitized;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const startTime = Date.now();

    const method = req.method;
    const url = req.url;
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userId = req.user?.id || req.user?.userId || req.user?.sub;

    // Log request
    const requestLog: Record<string, unknown> = {
      method,
      url,
      ip,
      userAgent: req.get('user-agent') || 'unknown',
      timestamp: new Date().toISOString(),
    };

    if (userId) requestLog.userId = userId;
    if (req.query && Object.keys(req.query).length > 0) requestLog.query = this.sanitize(req.query);
    if (method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
      requestLog.body = this.sanitize(req.body);
    }

    this.logger.log(`[REQUEST] ${JSON.stringify(requestLog)}`);

    return next.handle().pipe(
      tap({
        next: val => {
          const responseTime = Date.now() - startTime;
          const statusCode = res.statusCode || 200;

          const responseLog: Record<string, unknown> = {
            method,
            url,
            statusCode,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString(),
          };

          if (userId) responseLog.userId = userId;
          if (statusCode >= 400 && val && typeof val === 'object') {
            responseLog.response = this.sanitize(val);
          }

          this.logger.log(`[RESPONSE] ${JSON.stringify(responseLog)}`);
        },
        error: err => {
          const responseTime = Date.now() - startTime;
          const statusCode = err.status || res.statusCode || 500;

          const errorLog: Record<string, unknown> = {
            method,
            url,
            statusCode,
            responseTime: `${responseTime}ms`,
            error: err.message || 'Unknown error',
            timestamp: new Date().toISOString(),
          };

          if (userId) errorLog.userId = userId;
          if (err.stack && process.env.NODE_ENV !== 'production') {
            errorLog.stack = err.stack;
          }

          this.logger.error(`[ERROR] ${JSON.stringify(errorLog)}`);
        },
      }),
    );
  }
}
