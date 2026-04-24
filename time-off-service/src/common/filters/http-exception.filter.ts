import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const requestId = (request.headers['x-request-id'] as string) || uuidv4();

    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      
      // Handle validation errors from class-validator
      if (exception instanceof BadRequestException && typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
        const responseObj = exceptionResponse as any;
        // class-validator returns an array of error messages
        if (Array.isArray(responseObj.message)) {
          errorCode = 'VALIDATION_ERROR';
          message = responseObj.message;
        } else {
          errorCode = responseObj.code || 'BAD_REQUEST';
          message = responseObj.message || exception.message;
        }
      } else if (typeof exceptionResponse === 'object' && 'code' in exceptionResponse) {
        errorCode = (exceptionResponse as any).code;
        message = (exceptionResponse as any).message || exception.message;
      } else {
        message = exception.message;
        errorCode = this.getDefaultErrorCode(status);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      error: errorCode,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private getDefaultErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'INTERNAL_SERVER_ERROR';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      case HttpStatus.BAD_GATEWAY:
        return 'BAD_GATEWAY';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
