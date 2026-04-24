export interface HCMBalanceResponse {
  employeeId: string;
  availableHours: number;
  accruedHours: number;
  usedHours: number;
  asOfDate: Date;
}

export interface HCMApprovalPayload {
  employeeId: string;
  startDate: string;
  endDate: string;
  hoursRequested: number;
  requestId: string;
}

export interface HCMApprovalResponse {
  success: boolean;
  requestId: string;
  message?: string;
  errorCode?: string;
}

export const HCM_CLIENT = 'HCM_CLIENT';

export interface IHCMClient {
  fetchBalance(employeeId: string): Promise<HCMBalanceResponse>;
  submitApproval(payload: HCMApprovalPayload, idempotencyKey: string): Promise<HCMApprovalResponse>;
  verifyApproval(employeeId: string, expectedDeduction: number): Promise<boolean>;
  fetchBalancesBatch(employeeIds: string[]): Promise<Map<string, HCMBalanceResponse>>;
  healthCheck(): Promise<boolean>;
}
