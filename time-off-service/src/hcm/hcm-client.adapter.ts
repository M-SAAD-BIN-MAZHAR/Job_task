import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IHCMClient,
  HCMBalanceResponse,
  HCMApprovalPayload,
  HCMApprovalResponse,
} from './hcm-client.interface';
import { HcmUnavailableException } from '../common/exceptions/custom-exceptions';
import { MetricsService } from '../common/metrics/metrics.service';

@Injectable()
export class HcmClientAdapter implements IHCMClient {
  private readonly logger = new Logger(HcmClientAdapter.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.baseUrl = configService.get<string>('HCM_BASE_URL', 'http://localhost:3001');
    this.apiKey = configService.get<string>('HCM_API_KEY', '');
    this.timeoutMs = configService.get<number>('HCM_TIMEOUT_MS', 5000);
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          ...(options.headers as Record<string, string>),
        },
      });
      return response;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new HcmUnavailableException(`HCM request timed out after ${this.timeoutMs}ms`);
      }
      throw new HcmUnavailableException(`HCM request failed: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async trackHCMCall<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;
    let errorCode: string | undefined;

    try {
      const result = await fn();
      success = true;
      return result;
    } catch (error: any) {
      errorCode = error.code || error.name || 'UNKNOWN';
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      this.metricsService.recordHCMCall({
        operation,
        success,
        duration,
        timestamp: new Date(),
        errorCode,
      });
    }
  }

  async fetchBalance(employeeId: string): Promise<HCMBalanceResponse> {
    return this.trackHCMCall('fetchBalance', async () => {
      const url = `${this.baseUrl}/balances/${employeeId}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        throw new HcmUnavailableException(`HCM fetchBalance failed: ${response.status}`);
      }

      return response.json() as Promise<HCMBalanceResponse>;
    });
  }

  async submitApproval(
    payload: HCMApprovalPayload,
    idempotencyKey: string,
  ): Promise<HCMApprovalResponse> {
    return this.trackHCMCall('submitApproval', async () => {
      const url = `${this.baseUrl}/time-off`;
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Idempotency-Key': idempotencyKey },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return {
          success: false,
          requestId: payload.requestId,
          errorCode: String(response.status),
          message: (body as any).message,
        };
      }

      return response.json() as Promise<HCMApprovalResponse>;
    });
  }

  async verifyApproval(employeeId: string, expectedDeduction: number): Promise<boolean> {
    return this.trackHCMCall('verifyApproval', async () => {
      try {
        const balance = await this.fetchBalance(employeeId);
        // Verification passes if HCM balance reflects the deduction (within 0.01 tolerance)
        return balance.availableHours <= balance.accruedHours - expectedDeduction + 0.01;
      } catch {
        return false;
      }
    });
  }

  async fetchBalancesBatch(employeeIds: string[]): Promise<Map<string, HCMBalanceResponse>> {
    return this.trackHCMCall('fetchBalancesBatch', async () => {
      const url = `${this.baseUrl}/balances/batch`;
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        body: JSON.stringify({ employeeIds }),
      });

      if (!response.ok) {
        throw new HcmUnavailableException(`HCM batch fetch failed: ${response.status}`);
      }

      const data = (await response.json()) as Record<string, HCMBalanceResponse>;
      return new Map(Object.entries(data));
    });
  }

  async healthCheck(): Promise<boolean> {
    return this.trackHCMCall('healthCheck', async () => {
      try {
        const response = await this.fetchWithTimeout(`${this.baseUrl}/health`);
        return response.ok;
      } catch {
        return false;
      }
    });
  }
}
