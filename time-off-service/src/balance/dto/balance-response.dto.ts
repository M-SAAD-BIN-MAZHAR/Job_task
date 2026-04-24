import { IsString, IsNumber, IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class BalanceResponseDto {
  @IsString()
  employeeId: string;

  @IsNumber()
  availableHours: number;

  @IsNumber()
  accruedHours: number;

  @IsNumber()
  usedHours: number;

  @IsDateString()
  lastSyncedAt: string;

  @IsBoolean()
  isStale: boolean;

  @IsOptional()
  @IsDateString()
  staleSince?: string;
}
