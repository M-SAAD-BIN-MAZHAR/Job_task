import { HttpExceptionFilter } from './http-exception.filter';
import { ArgumentsHost, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Unit tests for HttpExceptionFilter
 *
 * **Validates: Requirements 18.1, 18.2, 18.3, 18.4**
 */
describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;
  let mockArgumentsHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      headers: {},
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  describe('Standard HTTP Exceptions', () => {
    it('should handle custom TimeOffException with error code', () => {
      const exception = new HttpException(
        { code: 'INSUFFICIENT_BALANCE', message: 'Not enough hours available' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'INSUFFICIENT_BALANCE',
          message: 'Not enough hours available',
          timestamp: expect.any(String),
          requestId: expect.any(String),
        }),
      );
    });

    it('should handle generic HttpException without custom code', () => {
      const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BAD_REQUEST',
          message: 'Bad request',
        }),
      );
    });

    it('should use x-request-id header if present', () => {
      mockRequest.headers = { 'x-request-id': 'test-request-id-123' };
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-request-id-123',
        }),
      );
    });
  });

  describe('Validation Errors', () => {
    it('should handle validation errors with array of messages', () => {
      const exception = new BadRequestException({
        message: [
          'employeeId must be a valid UUID',
          'startDate must be a valid ISO 8601 date string',
          'hoursRequested must be at least 0.01 hours',
        ],
        error: 'Bad Request',
        statusCode: 400,
      });

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'VALIDATION_ERROR',
          message: [
            'employeeId must be a valid UUID',
            'startDate must be a valid ISO 8601 date string',
            'hoursRequested must be at least 0.01 hours',
          ],
        }),
      );
    });

    it('should handle single validation error message', () => {
      const exception = new BadRequestException('Invalid input');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid input',
        }),
      );
    });
  });

  describe('Non-HTTP Exceptions', () => {
    it('should handle generic Error as 500 Internal Server Error', () => {
      const exception = new Error('Unexpected error');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error',
        }),
      );
    });

    it('should handle unknown exception type', () => {
      const exception = 'string error';

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        }),
      );
    });
  });

  describe('Error Code Mapping', () => {
    it('should map 404 to NOT_FOUND error code', () => {
      const exception = new HttpException('Resource not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'NOT_FOUND',
        }),
      );
    });

    it('should map 409 to CONFLICT error code', () => {
      const exception = new HttpException('Conflict detected', HttpStatus.CONFLICT);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'CONFLICT',
        }),
      );
    });

    it('should map 503 to SERVICE_UNAVAILABLE error code', () => {
      const exception = new HttpException('Service unavailable', HttpStatus.SERVICE_UNAVAILABLE);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'SERVICE_UNAVAILABLE',
        }),
      );
    });
  });

  describe('Response Format', () => {
    it('should always include required fields in error response', () => {
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall).toHaveProperty('statusCode');
      expect(responseCall).toHaveProperty('error');
      expect(responseCall).toHaveProperty('message');
      expect(responseCall).toHaveProperty('requestId');
      expect(responseCall).toHaveProperty('timestamp');
    });

    it('should format timestamp as ISO 8601 string', () => {
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      const timestamp = new Date(responseCall.timestamp);
      expect(timestamp.toISOString()).toBe(responseCall.timestamp);
    });
  });
});
