import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';
import { IsDateRangeValid } from '../../common/validators/date-range.validator';

/**
 * DTO for updating a time-off request (DRAFT state only)
 *
 * **Validates: Requirements 18.1, 18.5**
 */
export class UpdateRequestDto {
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
  @IsDateRangeValid('endDate', { message: 'startDate must be before or equal to endDate' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
  endDate?: string;

  @IsOptional()
  @IsNumber({}, { message: 'hoursRequested must be a number' })
  @Min(0.01, { message: 'hoursRequested must be at least 0.01 hours' })
  hoursRequested?: number;
}
