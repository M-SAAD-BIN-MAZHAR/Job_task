import {
  IHCMClient,
  HCMBalanceResponse,
  HCMApprovalPayload,
  HCMApprovalResponse,
} from './hcm-client.interface';

export type FaultMode = 'NONE' | 'ERROR_500' | 'TIMEOUT' | 'SILENT_200' | 'INVALID_DIMENSION';

export class MockHcmClient implements IHCMClient {
  private balances = new Map<string, HCMBalanceResponse>();
  private faultMode: FaultMode = 'NONE';
  private delayMs = 0;

  setFaultMode(mode: FaultMode): void {
    this.faultMode = mode;
  }

  setDelay(ms: number): void {
    this.delayMs = ms;
  }

  seedBalance(employeeId: string, availableHours: number, accruedHours?: number): void {
    this.balances.set(employeeId, {
      employeeId,
      availableHours,
      accruedHours: accruedHours ?? availableHours,
      usedHours: (accruedHours ?? availableHours) - availableHours,
      asOfDate: new Date(),
    });
  }

  seedBalances(entries: Array<{ id: string; hours: number }>): void {
    for (const e of entries) this.seedBalance(e.id, e.hours);
  }

  private async applyDelay(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
  }

  private async applyFault(): Promise<void> {
    await this.applyDelay();
    if (this.faultMode === 'TIMEOUT') {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('HCM timeout')), 5001));
    }
    if (this.faultMode === 'ERROR_500') {
      throw new Error('HCM internal server error (500)');
    }
  }

  async fetchBalance(employeeId: string): Promise<HCMBalanceResponse> {
    await this.applyFault();
    const balance = this.balances.get(employeeId);
    if (!balance) {
      return {
        employeeId,
        availableHours: 0,
        accruedHours: 0,
        usedHours: 0,
        asOfDate: new Date(),
      };
    }
    return { ...balance };
  }

  async submitApproval(
    payload: HCMApprovalPayload,
    _idempotencyKey: string,
  ): Promise<HCMApprovalResponse> {
    await this.applyFault();

    if (this.faultMode === 'SILENT_200') {
      // Returns success but does NOT actually deduct balance
      return { success: true, requestId: payload.requestId };
    }

    if (this.faultMode === 'INVALID_DIMENSION') {
      return { success: false, requestId: payload.requestId, errorCode: 'INVALID_DIMENSION' };
    }

    // Normal: deduct balance
    const balance = this.balances.get(payload.employeeId);
    if (balance) {
      balance.availableHours = Math.max(0, balance.availableHours - payload.hoursRequested);
      balance.usedHours += payload.hoursRequested;
      balance.asOfDate = new Date();
    }

    return { success: true, requestId: payload.requestId };
  }

  async verifyApproval(employeeId: string, expectedDeduction: number): Promise<boolean> {
    if (this.faultMode === 'SILENT_200') return false; // silent failure — balance not deducted
    const balance = this.balances.get(employeeId);
    if (!balance) return false;
    return balance.usedHours >= expectedDeduction;
  }

  async fetchBalancesBatch(employeeIds: string[]): Promise<Map<string, HCMBalanceResponse>> {
    await this.applyFault();
    const result = new Map<string, HCMBalanceResponse>();
    for (const id of employeeIds) {
      result.set(id, await this.fetchBalance(id));
    }
    return result;
  }

  async healthCheck(): Promise<boolean> {
    if (this.faultMode === 'TIMEOUT' || this.faultMode === 'ERROR_500') return false;
    return true;
  }

  reset(): void {
    this.balances.clear();
    this.faultMode = 'NONE';
    this.delayMs = 0;
  }
}
