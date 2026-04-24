import { IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';

/**
 * DTO for rejecting a time-off request
 *
 * **Validates: Requirement 18.4**
 */
export class RejectRequestDto {
  @IsString({ message: 'reason must be a string' })
  @IsNotEmpty({ message: 'reason is required' })
  @MinLength(1, { message: 'reason must not be empty' })
  @MaxLength(500, { message: 'reason must not exceed 500 characters' })
  reason: string;
}
