import { IsString, IsNumber, IsEnum, IsDateString, IsOptional, IsObject, Min, IsNotEmpty } from 'class-validator';

/**
 * DTO for HCM webhook payload
 *
 * **Validates: Requirements 5.1, 5.2, 5.5, 18.1**
 */
export class WebhookPayloadDto {
  @IsEnum(['BALANCE_UPDATE', 'ANNIVERSARY_ACCRUAL', 'YEAR_START_RESET'], {
    message: 'eventType must be one of: BALANCE_UPDATE, ANNIVERSARY_ACCRUAL, YEAR_START_RESET',
  })
  @IsNotEmpty({ message: 'eventType is required' })
  eventType: 'BALANCE_UPDATE' | 'ANNIVERSARY_ACCRUAL' | 'YEAR_START_RESET';

  @IsString({ message: 'employeeId must be a string' })
  @IsNotEmpty({ message: 'employeeId is required' })
  employeeId: string;

  @IsNumber({}, { message: 'availableHours must be a number' })
  @Min(0, { message: 'availableHours must be non-negative' })
  @IsNotEmpty({ message: 'availableHours is required' })
  availableHours: number;

  @IsNumber({}, { message: 'accruedHours must be a number' })
  @Min(0, { message: 'accruedHours must be non-negative' })
  @IsNotEmpty({ message: 'accruedHours is required' })
  accruedHours: number;

  @IsNumber({}, { message: 'usedHours must be a number' })
  @Min(0, { message: 'usedHours must be non-negative' })
  @IsNotEmpty({ message: 'usedHours is required' })
  usedHours: number;

  @IsDateString({}, { message: 'timestamp must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'timestamp is required' })
  timestamp: string;

  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  metadata?: Record<string, unknown>;
}
