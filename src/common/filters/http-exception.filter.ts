import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface RequestWithUser extends Request {
  user?: {
    id?: string | number;
  };
}

interface ExceptionResponseObject {
  message?: string;
  error?: string;
  errors?: string[] | Record<string, unknown>;
  [key: string]: unknown;
}

interface ErrorResponse {
  success: false;
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string;
  errors?: string[] | Record<string, unknown>;
  stack?: string;
  error?: string;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isDevelopment = process.env.NODE_ENV === 'development';

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithUser>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // 1. Log errors appropriately based on their severity
    this.logError(exception, status, request);

    // 2. Format error responses in a consistent way
    // 3. Include relevant error details without exposing sensitive information
    const errorResponse = this.formatErrorResponse(exception, status, exceptionResponse, request);

    // 4. Handle different types of errors with appropriate status codes
    response.status(status).json(errorResponse);
  }

  private logError(exception: HttpException, status: number, request: RequestWithUser): void {
    const context = JSON.stringify({
      statusCode: status,
      path: request.url,
      method: request.method,
      userId: request.user?.id,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Internal Server Error: ${exception.message}`, exception.stack);
      this.logger.error('Request Context:', context);
    } else if (status >= HttpStatus.BAD_REQUEST) {
      this.logger.warn(`Client Error [${status}]: ${exception.message}`, context);
    } else {
      this.logger.debug(`HTTP Exception [${status}]: ${exception.message}`, context);
    }
  }

  private formatErrorResponse(
    exception: HttpException,
    status: number,
    exceptionResponse: string | object,
    request: RequestWithUser,
  ): ErrorResponse {
    const responseObj =
      typeof exceptionResponse === 'string'
        ? { message: exceptionResponse }
        : (exceptionResponse as ExceptionResponseObject);

    const message =
      status >= HttpStatus.INTERNAL_SERVER_ERROR && !this.isDevelopment
        ? 'Internal server error'
        : responseObj.message || exception.message || 'An error occurred';

    const errorResponse: ErrorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    };

    // Include validation errors if present
    if (responseObj.errors) {
      errorResponse.errors = Array.isArray(responseObj.errors)
        ? responseObj.errors
        : (responseObj.errors as Record<string, unknown>);
    }

    // Include debug info in development only
    if (this.isDevelopment) {
      errorResponse.stack = exception.stack;
      if (responseObj.error) {
        errorResponse.error = responseObj.error;
      }
    }

    return errorResponse;
  }
}
