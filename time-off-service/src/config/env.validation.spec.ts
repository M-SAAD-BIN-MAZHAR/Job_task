import 'reflect-metadata';
import { validateEnvironment } from './env.validation';

describe('Configuration Validation', () => {
  describe('validateEnvironment', () => {
    describe('Valid Configuration', () => {
      it('should validate a complete valid configuration', () => {
        const config = {
          PORT: '3000',
          NODE_ENV: 'development',
          LOG_LEVEL: 'info',
          DATABASE_PATH: './data/test.db',
          JWT_SECRET: 'test-secret-key',
          JWT_EXPIRATION: '24h',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          HCM_WEBHOOK_SECRET: 'test-webhook-secret',
          HCM_TIMEOUT_MS: '5000',
          HCM_MAX_RETRIES: '3',
          BALANCE_STALE_THRESHOLD_MS: '300000',
          OUTBOX_POLL_INTERVAL_MS: '5000',
        };

        const result = validateEnvironment(config);

        expect(result).toBeDefined();
        expect(result.app.PORT).toBe(3000);
        expect(result.app.NODE_ENV).toBe('development');
        expect(result.app.LOG_LEVEL).toBe('info');
        expect(result.database.DATABASE_PATH).toBe('./data/test.db');
        expect(result.jwt.JWT_SECRET).toBe('test-secret-key');
        expect(result.jwt.JWT_EXPIRATION).toBe('24h');
        expect(result.hcm.HCM_BASE_URL).toBe('http://localhost:3001');
        expect(result.hcm.HCM_API_KEY).toBe('test-api-key');
        expect(result.hcm.HCM_WEBHOOK_SECRET).toBe('test-webhook-secret');
        expect(result.hcm.HCM_TIMEOUT_MS).toBe(5000);
        expect(result.hcm.HCM_MAX_RETRIES).toBe(3);
      });

      it('should apply default values for optional fields', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
        };

        const result = validateEnvironment(config);

        expect(result.app.PORT).toBe(3000);
        expect(result.app.NODE_ENV).toBe('development');
        expect(result.app.LOG_LEVEL).toBe('info');
        expect(result.database.DATABASE_PATH).toBe('./data/timeoff.db');
        expect(result.jwt.JWT_EXPIRATION).toBe('24h');
        expect(result.hcm.HCM_TIMEOUT_MS).toBe(5000);
        expect(result.hcm.HCM_MAX_RETRIES).toBe(3);
        expect(result.app.BALANCE_STALE_THRESHOLD_MS).toBe(300000);
        expect(result.app.OUTBOX_POLL_INTERVAL_MS).toBe(5000);
      });

      it('should convert string numbers to actual numbers', () => {
        const config = {
          PORT: '8080',
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          HCM_TIMEOUT_MS: '10000',
          HCM_MAX_RETRIES: '5',
          BALANCE_STALE_THRESHOLD_MS: '600000',
          OUTBOX_POLL_INTERVAL_MS: '10000',
        };

        const result = validateEnvironment(config);

        expect(typeof result.app.PORT).toBe('number');
        expect(result.app.PORT).toBe(8080);
        expect(typeof result.hcm.HCM_TIMEOUT_MS).toBe('number');
        expect(result.hcm.HCM_TIMEOUT_MS).toBe(10000);
        expect(typeof result.hcm.HCM_MAX_RETRIES).toBe('number');
        expect(result.hcm.HCM_MAX_RETRIES).toBe(5);
        expect(typeof result.app.BALANCE_STALE_THRESHOLD_MS).toBe('number');
        expect(result.app.BALANCE_STALE_THRESHOLD_MS).toBe(600000);
        expect(typeof result.app.OUTBOX_POLL_INTERVAL_MS).toBe('number');
        expect(result.app.OUTBOX_POLL_INTERVAL_MS).toBe(10000);
      });
    });

    describe('Required Fields Validation', () => {
      it('should fail when JWT_SECRET is missing', () => {
        const config = {
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /JWT_SECRET is required and must not be empty/
        );
      });

      it('should fail when JWT_SECRET is empty string', () => {
        const config = {
          JWT_SECRET: '',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /JWT_SECRET is required and must not be empty/
        );
      });

      it('should fail when HCM_BASE_URL is missing', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_API_KEY: 'test-api-key',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /HCM_BASE_URL is required and must not be empty/
        );
      });

      it('should fail when HCM_API_KEY is missing', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /HCM_API_KEY is required and must not be empty/
        );
      });

      it('should fail with multiple missing required fields', () => {
        const config = {};

        expect(() => validateEnvironment(config)).toThrow(
          /Configuration validation failed/
        );
        expect(() => validateEnvironment(config)).toThrow(/JWT_SECRET/);
        expect(() => validateEnvironment(config)).toThrow(/HCM_BASE_URL/);
        expect(() => validateEnvironment(config)).toThrow(/HCM_API_KEY/);
      });
    });

    describe('Port Validation', () => {
      it('should accept valid port numbers', () => {
        const config = {
          PORT: '8080',
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
        };

        const result = validateEnvironment(config);
        expect(result.app.PORT).toBe(8080);
      });

      it('should fail when PORT is less than 1', () => {
        const config = {
          PORT: '0',
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /PORT must be at least 1/
        );
      });

      it('should fail when PORT exceeds 65535', () => {
        const config = {
          PORT: '65536',
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /PORT must not exceed 65535/
        );
      });
    });

    describe('NODE_ENV Validation', () => {
      it('should accept valid NODE_ENV values', () => {
        const validEnvs = ['development', 'production', 'test'];

        validEnvs.forEach((env) => {
          const config = {
            NODE_ENV: env,
            JWT_SECRET: 'test-secret-key',
            HCM_BASE_URL: 'http://localhost:3001',
            HCM_API_KEY: 'test-api-key',
          };

          const result = validateEnvironment(config);
          expect(result.app.NODE_ENV).toBe(env);
        });
      });

      it('should fail when NODE_ENV is invalid', () => {
        const config = {
          NODE_ENV: 'invalid',
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /NODE_ENV must be one of: development, production, test/
        );
      });
    });

    describe('LOG_LEVEL Validation', () => {
      it('should accept valid LOG_LEVEL values', () => {
        const validLevels = ['error', 'warn', 'info', 'debug', 'verbose'];

        validLevels.forEach((level) => {
          const config = {
            LOG_LEVEL: level,
            JWT_SECRET: 'test-secret-key',
            HCM_BASE_URL: 'http://localhost:3001',
            HCM_API_KEY: 'test-api-key',
          };

          const result = validateEnvironment(config);
          expect(result.app.LOG_LEVEL).toBe(level);
        });
      });

      it('should fail when LOG_LEVEL is invalid', () => {
        const config = {
          LOG_LEVEL: 'invalid',
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /LOG_LEVEL must be one of: error, warn, info, debug, verbose/
        );
      });
    });

    describe('HCM Timeout Validation', () => {
      it('should accept valid timeout values', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          HCM_TIMEOUT_MS: '10000',
        };

        const result = validateEnvironment(config);
        expect(result.hcm.HCM_TIMEOUT_MS).toBe(10000);
      });

      it('should fail when timeout is less than 1000ms', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          HCM_TIMEOUT_MS: '500',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /HCM_TIMEOUT_MS must be at least 1000ms/
        );
      });

      it('should fail when timeout exceeds 30000ms', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          HCM_TIMEOUT_MS: '35000',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /HCM_TIMEOUT_MS must not exceed 30000ms/
        );
      });
    });

    describe('HCM Max Retries Validation', () => {
      it('should accept valid retry values', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          HCM_MAX_RETRIES: '5',
        };

        const result = validateEnvironment(config);
        expect(result.hcm.HCM_MAX_RETRIES).toBe(5);
      });

      it('should accept 0 retries', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          HCM_MAX_RETRIES: '0',
        };

        const result = validateEnvironment(config);
        expect(result.hcm.HCM_MAX_RETRIES).toBe(0);
      });

      it('should fail when retries is negative', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          HCM_MAX_RETRIES: '-1',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /HCM_MAX_RETRIES must be at least 0/
        );
      });

      it('should fail when retries exceeds 10', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          HCM_MAX_RETRIES: '15',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /HCM_MAX_RETRIES must not exceed 10/
        );
      });
    });

    describe('Balance Stale Threshold Validation', () => {
      it('should accept valid threshold values', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          BALANCE_STALE_THRESHOLD_MS: '600000',
        };

        const result = validateEnvironment(config);
        expect(result.app.BALANCE_STALE_THRESHOLD_MS).toBe(600000);
      });

      it('should fail when threshold is less than 1000ms', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          BALANCE_STALE_THRESHOLD_MS: '500',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /BALANCE_STALE_THRESHOLD_MS must be at least 1000ms/
        );
      });
    });

    describe('Outbox Poll Interval Validation', () => {
      it('should accept valid interval values', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          OUTBOX_POLL_INTERVAL_MS: '10000',
        };

        const result = validateEnvironment(config);
        expect(result.app.OUTBOX_POLL_INTERVAL_MS).toBe(10000);
      });

      it('should fail when interval is less than 1000ms', () => {
        const config = {
          JWT_SECRET: 'test-secret-key',
          HCM_BASE_URL: 'http://localhost:3001',
          HCM_API_KEY: 'test-api-key',
          OUTBOX_POLL_INTERVAL_MS: '500',
        };

        expect(() => validateEnvironment(config)).toThrow(
          /OUTBOX_POLL_INTERVAL_MS must be at least 1000ms/
        );
      });
    });

    describe('Error Message Formatting', () => {
      it('should provide clear error messages with field names', () => {
        const config = {
          PORT: '99999',
          NODE_ENV: 'invalid',
        };

        try {
          validateEnvironment(config);
          fail('Should have thrown an error');
        } catch (error) {
          expect(error.message).toContain('Configuration validation failed');
          expect(error.message).toContain('PORT');
          expect(error.message).toContain('NODE_ENV');
          expect(error.message).toContain('JWT_SECRET');
          expect(error.message).toContain('HCM_BASE_URL');
          expect(error.message).toContain('HCM_API_KEY');
          expect(error.message).toContain('Please check your .env file');
        }
      });
    });
  });
});
