import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DataSource } from 'typeorm';
import { HCM_CLIENT, IHCMClient } from '../hcm/hcm-client.interface';
import { MetricsService } from '../common/metrics/metrics.service';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockHcmClient: jest.Mocked<IHCMClient>;
  let mockMetricsService: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    // Create mock DataSource
    mockDataSource = {
      query: jest.fn(),
    } as any;

    // Create mock HCM Client
    mockHcmClient = {
      healthCheck: jest.fn(),
      fetchBalance: jest.fn(),
      submitApproval: jest.fn(),
      verifyApproval: jest.fn(),
      fetchBalancesBatch: jest.fn(),
    };

    // Create mock MetricsService
    mockMetricsService = {
      recordHCMCall: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({
        hcmCalls: { total: 0, successful: 0, failed: 0 },
        avgDuration: 0,
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: HCM_CLIENT,
          useValue: mockHcmClient,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return ok status when both database and HCM are up', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('up');
      expect(result.hcm.status).toBe('up');
      expect(result.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.hcm.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockHcmClient.healthCheck).toHaveBeenCalled();
    });

    it('should return degraded status when database is up but HCM is down', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(false);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.status).toBe('degraded');
      expect(result.database.status).toBe('up');
      expect(result.hcm.status).toBe('down');
      expect(result.timestamp).toBeDefined();
    });

    it('should return degraded status when database is up but HCM throws error', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockRejectedValue(new Error('HCM connection failed'));

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.status).toBe('degraded');
      expect(result.database.status).toBe('up');
      expect(result.hcm.status).toBe('down');
      expect(result.timestamp).toBeDefined();
    });

    it('should return down status when database is down', async () => {
      // Arrange
      mockDataSource.query.mockRejectedValue(new Error('Database connection failed'));
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.status).toBe('down');
      expect(result.database.status).toBe('down');
      expect(result.hcm.status).toBe('up');
      expect(result.timestamp).toBeDefined();
    });

    it('should return down status when both database and HCM are down', async () => {
      // Arrange
      mockDataSource.query.mockRejectedValue(new Error('Database connection failed'));
      mockHcmClient.healthCheck.mockResolvedValue(false);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.status).toBe('down');
      expect(result.database.status).toBe('down');
      expect(result.hcm.status).toBe('down');
      expect(result.timestamp).toBeDefined();
    });

    it('should include latency measurements for both checks', async () => {
      // Arrange
      mockDataSource.query.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ '1': 1 }]), 10)),
      );
      mockHcmClient.healthCheck.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 15)),
      );

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.database.latencyMs).toBeGreaterThanOrEqual(10);
      expect(result.hcm.latencyMs).toBeGreaterThanOrEqual(15);
    });
  });

  describe('getLiveness', () => {
    it('should always return ok status', async () => {
      // Act
      const result = await controller.getLiveness();

      // Assert
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });

    it('should not check database or HCM', async () => {
      // Act
      await controller.getLiveness();

      // Assert
      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(mockHcmClient.healthCheck).not.toHaveBeenCalled();
    });

    it('should return valid ISO timestamp', async () => {
      // Act
      const result = await controller.getLiveness();

      // Assert
      const timestamp = new Date(result.timestamp);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });
  });

  describe('getReadiness', () => {
    it('should return ok status when both database and HCM are up', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const result = await controller.getReadiness();

      // Assert
      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('up');
      expect(result.hcm.status).toBe('up');
      expect(result.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.hcm.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockHcmClient.healthCheck).toHaveBeenCalled();
    });

    it('should return degraded status when database is up but HCM is down', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(false);

      // Act
      const result = await controller.getReadiness();

      // Assert
      expect(result.status).toBe('degraded');
      expect(result.database.status).toBe('up');
      expect(result.hcm.status).toBe('down');
      expect(result.timestamp).toBeDefined();
    });

    it('should return down status when database is down', async () => {
      // Arrange
      mockDataSource.query.mockRejectedValue(new Error('Database connection failed'));
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const result = await controller.getReadiness();

      // Assert
      expect(result.status).toBe('down');
      expect(result.database.status).toBe('down');
      expect(result.hcm.status).toBe('up');
      expect(result.timestamp).toBeDefined();
    });

    it('should return down status when both database and HCM are down', async () => {
      // Arrange
      mockDataSource.query.mockRejectedValue(new Error('Database connection failed'));
      mockHcmClient.healthCheck.mockResolvedValue(false);

      // Act
      const result = await controller.getReadiness();

      // Assert
      expect(result.status).toBe('down');
      expect(result.database.status).toBe('down');
      expect(result.hcm.status).toBe('down');
      expect(result.timestamp).toBeDefined();
    });

    it('should handle database query timeout gracefully', async () => {
      // Arrange
      mockDataSource.query.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), 100),
          ),
      );
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const result = await controller.getReadiness();

      // Assert
      expect(result.status).toBe('down');
      expect(result.database.status).toBe('down');
      expect(result.database.latencyMs).toBeGreaterThanOrEqual(100);
    });

    it('should handle HCM health check timeout gracefully', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('HCM timeout')), 100),
          ),
      );

      // Act
      const result = await controller.getReadiness();

      // Assert
      expect(result.status).toBe('degraded');
      expect(result.hcm.status).toBe('down');
      expect(result.hcm.latencyMs).toBeGreaterThanOrEqual(100);
    });

    it('should include latency measurements for both checks', async () => {
      // Arrange
      mockDataSource.query.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ '1': 1 }]), 5)),
      );
      mockHcmClient.healthCheck.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 10)),
      );

      // Act
      const result = await controller.getReadiness();

      // Assert
      expect(result.database.latencyMs).toBeGreaterThanOrEqual(5);
      expect(result.hcm.latencyMs).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Database Check', () => {
    it('should execute SELECT 1 query for database check', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      await controller.getHealth();

      // Assert
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('should measure database query latency accurately', async () => {
      // Arrange
      const delayMs = 20;
      mockDataSource.query.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ '1': 1 }]), delayMs)),
      );
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.database.latencyMs).toBeGreaterThanOrEqual(delayMs);
      expect(result.database.latencyMs).toBeLessThan(delayMs + 50); // Allow some margin
    });
  });

  describe('HCM Check', () => {
    it('should call healthCheck method on HCM client', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      await controller.getHealth();

      // Assert
      expect(mockHcmClient.healthCheck).toHaveBeenCalled();
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('should measure HCM health check latency accurately', async () => {
      // Arrange
      const delayMs = 25;
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), delayMs)),
      );

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.hcm.latencyMs).toBeGreaterThanOrEqual(delayMs);
      expect(result.hcm.latencyMs).toBeLessThan(delayMs + 50); // Allow some margin
    });

    it('should treat false response from healthCheck as down', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(false);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.hcm.status).toBe('down');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null response from database query', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue(null);
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('up');
    });

    it('should handle empty array response from database query', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([]);
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('up');
    });

    it('should handle concurrent health check requests', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const results = await Promise.all([
        controller.getHealth(),
        controller.getHealth(),
        controller.getHealth(),
      ]);

      // Assert
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.status).toBe('ok');
        expect(result.database.status).toBe('up');
        expect(result.hcm.status).toBe('up');
      });
      expect(mockDataSource.query).toHaveBeenCalledTimes(3);
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(3);
    });
  });

  describe('Timestamp Validation', () => {
    it('should return valid ISO 8601 timestamp in all responses', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const healthResult = await controller.getHealth();
      const livenessResult = await controller.getLiveness();
      const readinessResult = await controller.getReadiness();

      // Assert
      const healthTimestamp = new Date(healthResult.timestamp);
      const livenessTimestamp = new Date(livenessResult.timestamp);
      const readinessTimestamp = new Date(readinessResult.timestamp);

      expect(healthTimestamp.toISOString()).toBe(healthResult.timestamp);
      expect(livenessTimestamp.toISOString()).toBe(livenessResult.timestamp);
      expect(readinessTimestamp.toISOString()).toBe(readinessResult.timestamp);
    });

    it('should return recent timestamps', async () => {
      // Arrange
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockHcmClient.healthCheck.mockResolvedValue(true);
      const beforeTime = Date.now();

      // Act
      const result = await controller.getHealth();
      const afterTime = Date.now();

      // Assert
      const resultTime = new Date(result.timestamp).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(beforeTime);
      expect(resultTime).toBeLessThanOrEqual(afterTime);
    });
  });
});
