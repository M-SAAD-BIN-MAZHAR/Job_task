import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './env.validation';

describe('Startup Configuration Validation', () => {
  describe('Application Bootstrap', () => {
    it('should fail to create module when JWT_SECRET is missing', async () => {
      // Set environment without JWT_SECRET
      const originalEnv = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      delete process.env.HCM_BASE_URL;
      delete process.env.HCM_API_KEY;

      try {
        await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              validate: validateEnvironment,
              ignoreEnvFile: true,
            }),
          ],
        }).compile();

        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Configuration validation failed');
        expect(error.message).toContain('JWT_SECRET');
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.JWT_SECRET = originalEnv;
        }
      }
    });

    it('should successfully create module with valid configuration', async () => {
      // Set valid environment
      process.env.JWT_SECRET = 'test-secret-key';
      process.env.HCM_BASE_URL = 'http://localhost:3001';
      process.env.HCM_API_KEY = 'test-api-key';

      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            validate: validateEnvironment,
            ignoreEnvFile: true,
          }),
        ],
      }).compile();

      expect(moduleRef).toBeDefined();
    });

    it('should fail when PORT is invalid', async () => {
      process.env.JWT_SECRET = 'test-secret-key';
      process.env.HCM_BASE_URL = 'http://localhost:3001';
      process.env.HCM_API_KEY = 'test-api-key';
      process.env.PORT = '99999';

      try {
        await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              validate: validateEnvironment,
              ignoreEnvFile: true,
            }),
          ],
        }).compile();

        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('PORT must not exceed 65535');
      } finally {
        delete process.env.PORT;
      }
    });

    it('should fail when NODE_ENV is invalid', async () => {
      process.env.JWT_SECRET = 'test-secret-key';
      process.env.HCM_BASE_URL = 'http://localhost:3001';
      process.env.HCM_API_KEY = 'test-api-key';
      process.env.NODE_ENV = 'invalid-env';

      try {
        await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              validate: validateEnvironment,
              ignoreEnvFile: true,
            }),
          ],
        }).compile();

        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain(
          'NODE_ENV must be one of: development, production, test'
        );
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });

    it('should fail when HCM_TIMEOUT_MS is below minimum', async () => {
      process.env.JWT_SECRET = 'test-secret-key';
      process.env.HCM_BASE_URL = 'http://localhost:3001';
      process.env.HCM_API_KEY = 'test-api-key';
      process.env.HCM_TIMEOUT_MS = '500';

      try {
        await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              validate: validateEnvironment,
              ignoreEnvFile: true,
            }),
          ],
        }).compile();

        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain(
          'HCM_TIMEOUT_MS must be at least 1000ms'
        );
      } finally {
        delete process.env.HCM_TIMEOUT_MS;
      }
    });

    it('should fail when HCM_MAX_RETRIES exceeds maximum', async () => {
      process.env.JWT_SECRET = 'test-secret-key';
      process.env.HCM_BASE_URL = 'http://localhost:3001';
      process.env.HCM_API_KEY = 'test-api-key';
      process.env.HCM_MAX_RETRIES = '15';

      try {
        await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              validate: validateEnvironment,
              ignoreEnvFile: true,
            }),
          ],
        }).compile();

        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain(
          'HCM_MAX_RETRIES must not exceed 10'
        );
      } finally {
        delete process.env.HCM_MAX_RETRIES;
      }
    });
  });
});
