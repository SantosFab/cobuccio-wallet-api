import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

function calculateCheckDigit(digits: string, weightStart: number): number {
  const sum = digits
    .split('')
    .reduce(
      (acc, digit, index) => acc + Number(digit) * (weightStart - index),
      0,
    );

  const remainder = (sum * 10) % 11;

  return remainder === 10 ? 0 : remainder;
}

// Same checksum algorithm as cobuccio-wallet-web/src/lib/validators/cpf.ts —
// the frontend already validates this, but the API must never trust
// client-side validation alone.
export function isValidCpf(value: string): boolean {
  if (typeof value !== 'string') return false;

  const digits = value.replace(/\D/g, '');

  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const firstCheckDigit = calculateCheckDigit(digits.slice(0, 9), 10);
  const secondCheckDigit = calculateCheckDigit(digits.slice(0, 10), 11);

  return (
    firstCheckDigit === Number(digits[9]) &&
    secondCheckDigit === Number(digits[10])
  );
}

@ValidatorConstraint({ name: 'isCpf', async: false })
class IsCpfConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidCpf(value);
  }

  defaultMessage(): string {
    return 'cpf must be a valid CPF number';
  }
}

export function IsCpf(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCpfConstraint,
    });
  };
}
