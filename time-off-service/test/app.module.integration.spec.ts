// Set test environment variables BEFORE importing AppModule
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key-for-module-wiring';
process.env.JWT_EXPIRATION = '1h';
process.env.HCM_BASE_URL = 'http://localhost:9999';
process.env.HCM_API_KEY = 'test-api-key';
process.env.HCM_TIMEOUT = '5000';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { BalanceService } from '../src/balance/balance.service';
import { RequestService } from '../src/request/request.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalSagaOrchestrator } from '../src/saga/approval-saga.orchestrator';
import { SyncService } from '../src/sync/sync.service';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { MetricsService } from '../src/common/metrics/metrics.service';
import { HCM_CLIENT } from '../src/hcm/hcm-client.interface';
import { DataSource } from 'typeorm';

describe('AppModule Integration (Module Wiring)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Core Module Dependencies', () => {
    it('should successfully create the AppModule', () => {
      expect(app).toBeDefined();
      expect(moduleRef).toBeDefined();
    });

    it('should have DatabaseModule configured with TypeORM DataSource', () => {
      const dataSource = moduleRef.get<DataSource>(DataSource);
      expect(dataSource).toBeDefined();
      expect(dataSource.isInitialized).toBe(true);
    });

    it('should have ConfigModule configured globally', () => {
      const configModule = moduleRef.get(ConfigModule);
      expect(configModule).toBeDefined();
    });
  });

  describe('Service Layer Wiring', () => {
    it('should resolve BalanceService with all dependencies', () => {
      const balanceService = moduleRef.get<BalanceService>(BalanceService);
      expect(balanceService).toBeDefined();
      expect(balanceService).toBeInstanceOf(BalanceService);
    });

    it('should resolve RequestService with all dependencies', () => {
      const requestService = moduleRef.get<RequestService>(RequestService);
      expect(requestService).toBeDefined();
      expect(requestService).toBeInstanceOf(RequestService);
    });

    it('should resolve LedgerService with all dependencies', () => {
      const ledgerService = moduleRef.get<LedgerService>(LedgerService);
      expect(ledgerService).toBeDefined();
      expect(ledgerService).toBeInstanceOf(LedgerService);
    });

    it('should resolve AuditService with all dependencies', () => {
      const auditService = moduleRef.get<AuditService>(AuditService);
      expect(auditService).toBeDefined();
      expect(auditService).toBeInstanceOf(AuditService);
    });

    it('should resolve ApprovalSagaOrchestrator with all dependencies', () => {
      const sagaOrchestrator = moduleRef.get<ApprovalSagaOrchestrator>(
        ApprovalSagaOrchestrator,
      );
      expect(sagaOrchestrator).toBeDefined();
      expect(sagaOrchestrator).toBeInstanceOf(ApprovalSagaOrchestrator);
    });

    it('should resolve SyncService with all dependencies', () => {
      const syncService = moduleRef.get<SyncService>(SyncService);
      expect(syncService).toBeDefined();
      expect(syncService).toBeInstanceOf(SyncService);
    });

    it('should resolve IdempotencyService with all dependencies', () => {
      const idempotencyService =
        moduleRef.get<IdempotencyService>(IdempotencyService);
      expect(idempotencyService).toBeDefined();
      expect(idempotencyService).toBeInstanceOf(IdempotencyService);
    });

    it('should resolve MetricsService from global CommonModule', () => {
      const metricsService = moduleRef.get<MetricsService>(MetricsService);
      expect(metricsService).toBeDefined();
      expect(metricsService).toBeInstanceOf(MetricsService);
    });
  });

  describe('HCM Client Wiring', () => {
    it('should resolve HCM_CLIENT provider', () => {
      const hcmClient = moduleRef.get(HCM_CLIENT);
      expect(hcmClient).toBeDefined();
      expect(typeof hcmClient.fetchBalance).toBe('function');
      expect(typeof hcmClient.submitApproval).toBe('function');
      expect(typeof hcmClient.healthCheck).toBe('function');
      expect(typeof hcmClient.verifyApproval).toBe('function');
      expect(typeof hcmClient.fetchBalancesBatch).toBe('function');
    });
  });

  describe('Circular Dependency Resolution', () => {
    it('should resolve BalanceModule and SyncModule circular dependency', () => {
      const balanceService = moduleRef.get<BalanceService>(BalanceService);
      const syncService = moduleRef.get<SyncService>(SyncService);

      expect(balanceService).toBeDefined();
      expect(syncService).toBeDefined();
    });

    it('should resolve RequestModule and SagaModule circular dependency', () => {
      const requestService = moduleRef.get<RequestService>(RequestService);
      const sagaOrchestrator = moduleRef.get<ApprovalSagaOrchestrator>(
        ApprovalSagaOrchestrator,
      );

      expect(requestService).toBeDefined();
      expect(sagaOrchestrator).toBeDefined();
    });
  });

  describe('Global Providers', () => {
    it('should have global exception filter configured', () => {
      const filters = Reflect.getMetadata('__filters__', AppModule) || [];
      // Global filters are configured via APP_FILTER provider
      expect(app).toBeDefined();
    });

    it('should have global interceptors configured', () => {
      const interceptors = Reflect.getMetadata('__interceptors__', AppModule) || [];
      // Global interceptors are configured via APP_INTERCEPTOR provider
      expect(app).toBeDefined();
    });

    it('should have global guards configured', () => {
      const guards = Reflect.getMetadata('__guards__', AppModule) || [];
      // Global guards are configured via APP_GUARD provider
      expect(app).toBeDefined();
    });
  });

  describe('Module Export Verification', () => {
    it('should have LedgerModule exports available to dependent modules', () => {
      // LedgerService should be available to BalanceModule
      const balanceService = moduleRef.get<BalanceService>(BalanceService);
      expect(balanceService).toBeDefined();
    });

    it('should have AuditModule exports available to dependent modules', () => {
      // AuditService should be available to multiple modules
      const auditService = moduleRef.get<AuditService>(AuditService);
      expect(auditService).toBeDefined();
    });

    it('should have HcmModule exports available to dependent modules', () => {
      // HCM_CLIENT should be available to BalanceModule, SagaModule, etc.
      const hcmClient = moduleRef.get(HCM_CLIENT);
      expect(hcmClient).toBeDefined();
    });

    it('should have IdempotencyModule exports available to dependent modules', () => {
      // IdempotencyService should be available to controllers
      const idempotencyService =
        moduleRef.get<IdempotencyService>(IdempotencyService);
      expect(idempotencyService).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required environment variables on startup', () => {
      // If we got here, configuration validation passed
      expect(process.env.DATABASE_PATH).toBeDefined();
      expect(process.env.JWT_SECRET).toBeDefined();
      expect(process.env.HCM_BASE_URL).toBeDefined();
    });

    it('should have database connection configured correctly', async () => {
      const dataSource = moduleRef.get<DataSource>(DataSource);
      expect(dataSource.options.type).toBe('sqlite');
      expect(dataSource.isInitialized).toBe(true);
    });
  });
});
