import { IsString, IsDateString, IsNumber, IsOptional, Min, IsUUID, IsNotEmpty } from 'class-validator';
import { IsDateRangeValid } from '../../common/validators/date-range.validator';

/**
 * DTO for creating a new time-off request
 *
 * **Validates: Requirements 18.1, 18.5, 18.7**
 */
export class CreateRequestDto {
  @IsString({ message: 'employeeId must be a string' })
  @IsNotEmpty({ message: 'employeeId is required' })
  employeeId: string;

  @IsString({ message: 'managerId must be a string' })
  @IsNotEmpty({ message: 'managerId is required' })
  managerId: string;

  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'startDate is required' })
  @IsDateRangeValid('endDate', { message: 'startDate must be before or equal to endDate' })
  startDate: string;

  @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'endDate is required' })
  endDate: string;

  @IsNumber({}, { message: 'hoursRequested must be a number' })
  @Min(0.01, { message: 'hoursRequested must be at least 0.01 hours' })
  @IsNotEmpty({ message: 'hoursRequested is required' })
  hoursRequested: number;

  @IsOptional()
  @IsString({ message: 'idempotencyKey must be a string' })
  idempotencyKey?: string;
}
