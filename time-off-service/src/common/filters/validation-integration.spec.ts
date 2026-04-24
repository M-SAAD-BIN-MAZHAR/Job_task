import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, Controller, Post, Body } from '@nestjs/common';
import request from 'supertest';
import { HttpExceptionFilter } from './http-exception.filter';
import { CreateRequestDto } from '../../request/dto/create-request.dto';

/**
 * Integration tests for validation and error handling
 * Tests the full pipeline: ValidationPipe -> HttpExceptionFilter
 *
 * **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7**
 */

// Test controller to simulate real endpoint behavior
@Controller('test')
class TestController {
  @Post('validate')
  async testValidation(@Body() dto: CreateRequestDto) {
    return { success: true, data: dto };
  }
}

describe('Validation and Error Handling Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Configure the same validation pipe as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Configure the global exception filter
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Valid Requests', () => {
    it('should accept valid request and return 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          employeeId: '123e4567-e89b-12d3-a456-426614174000',
          managerId: '123e4567-e89b-12d3-a456-426614174001',
          startDate: '2024-01-15T00:00:00.000Z',
          endDate: '2024-01-20T00:00:00.000Z',
          hoursRequested: 40,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Validation Error Responses', () => {
    it('should return 400 with VALIDATION_ERROR for missing required fields', async () => {
      const response = await request(app.getHttpServer()).post('/test/validate').send({
        // Missing all required fields
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'VALIDATION_ERROR',
      });
      expect(response.body.message).toBeInstanceOf(Array);
      expect(response.body.message.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return descriptive error for invalid date format', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          employeeId: '123e4567-e89b-12d3-a456-426614174000',
          managerId: '123e4567-e89b-12d3-a456-426614174001',
          startDate: '01/15/2024',
          endDate: '01/20/2024',
          hoursRequested: 40,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBeInstanceOf(Array);

      const messages = response.body.message.join(' ');
      expect(messages).toContain('ISO 8601');
    });

    it('should return descriptive error for invalid date range (startDate > endDate)', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          employeeId: '123e4567-e89b-12d3-a456-426614174000',
          managerId: '123e4567-e89b-12d3-a456-426614174001',
          startDate: '2024-01-25T00:00:00.000Z',
          endDate: '2024-01-20T00:00:00.000Z',
          hoursRequested: 40,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBeInstanceOf(Array);

      const messages = response.body.message.join(' ');
      expect(messages.toLocaleLowerCase()).toContain('before');
    });

    it('should return descriptive error for negative hoursRequested', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          employeeId: '123e4567-e89b-12d3-a456-426614174000',
          managerId: '123e4567-e89b-12d3-a456-426614174001',
          startDate: '2024-01-15T00:00:00.000Z',
          endDate: '2024-01-20T00:00:00.000Z',
          hoursRequested: -10,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBeInstanceOf(Array);

      const messages = response.body.message.join(' ');
      expect(messages).toContain('0.01');
    });

    it('should return descriptive error for zero hoursRequested', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          employeeId: '123e4567-e89b-12d3-a456-426614174000',
          managerId: '123e4567-e89b-12d3-a456-426614174001',
          startDate: '2024-01-15T00:00:00.000Z',
          endDate: '2024-01-20T00:00:00.000Z',
          hoursRequested: 0,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBeInstanceOf(Array);

      const messages = response.body.message.join(' ');
      expect(messages).toContain('0.01');
    });

    it('should strip unknown properties when forbidNonWhitelisted is true', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          employeeId: '123e4567-e89b-12d3-a456-426614174000',
          managerId: '123e4567-e89b-12d3-a456-426614174001',
          startDate: '2024-01-15T00:00:00.000Z',
          endDate: '2024-01-20T00:00:00.000Z',
          hoursRequested: 40,
          unknownField: 'should-be-rejected',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Error Response Format', () => {
    it('should always include statusCode, error, message, requestId, and timestamp', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          // Invalid payload
          employeeId: 'invalid',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should format timestamp as ISO 8601 string', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          employeeId: 'invalid',
        });

      expect(response.status).toBe(400);
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });

    it('should use x-request-id header if provided', async () => {
      const testRequestId = 'test-request-id-12345';

      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .set('x-request-id', testRequestId)
        .send({
          employeeId: 'invalid',
        });

      expect(response.status).toBe(400);
      expect(response.body.requestId).toBe(testRequestId);
    });

    it('should generate requestId if x-request-id header is not provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          employeeId: 'invalid',
        });

      expect(response.status).toBe(400);
      expect(response.body.requestId).toBeTruthy();
      expect(typeof response.body.requestId).toBe('string');
      expect(response.body.requestId.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple Validation Errors', () => {
    it('should return all validation errors in a single response', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          employeeId: 'invalid-uuid',
          managerId: 'invalid-uuid',
          startDate: 'invalid-date',
          endDate: 'invalid-date',
          hoursRequested: -10,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBeInstanceOf(Array);
      expect(response.body.message.length).toBeGreaterThan(3); // Multiple errors
    });
  });
});
