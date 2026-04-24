import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Custom validator to ensure start date is before or equal to end date
 * Used for time-off request date validation
 *
 * **Validates: Requirement 18.5**
 */
@ValidatorConstraint({ name: 'isDateRangeValid', async: false })
export class IsDateRangeValidConstraint implements ValidatorConstraintInterface {
  validate(startDate: any, args: ValidationArguments) {
    const object = args.object as any;
    const endDateField = args.constraints[0];
    const endDate = object[endDateField];

    if (!startDate || !endDate) {
      return true; // Let @IsDateString handle missing values
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    return start <= end;
  }

  defaultMessage(args: ValidationArguments) {
    const endDateField = args.constraints[0];
    return `Start date must be before or equal to ${endDateField}`;
  }
}

/**
 * Decorator to validate that start date is before or equal to end date
 * @param endDateProperty - The name of the end date property to compare against
 * @param validationOptions - Additional validation options
 */
export function IsDateRangeValid(endDateProperty: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [endDateProperty],
      validator: IsDateRangeValidConstraint,
    });
  };
}
