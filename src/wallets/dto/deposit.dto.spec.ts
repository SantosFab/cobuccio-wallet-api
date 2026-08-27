import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { DepositDto } from './deposit.dto';

function buildPayload(overrides: Partial<DepositDto> = {}) {
  return {
    amount: 100.5,
    cardNumber: '4242424242424242',
    cardCvv: '123',
    cardExpiry: '12/30',
    ...overrides,
  };
}

describe('DepositDto', () => {
  it('accepts a positive amount with up to 2 decimal places', async () => {
    const dto = plainToInstance(DepositDto, buildPayload());

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects zero', async () => {
    const dto = plainToInstance(DepositDto, buildPayload({ amount: 0 }));

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('rejects a negative amount', async () => {
    const dto = plainToInstance(DepositDto, buildPayload({ amount: -10 }));

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('rejects more than 2 decimal places', async () => {
    const dto = plainToInstance(DepositDto, buildPayload({ amount: 10.123 }));

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('rejects a cvv that is not exactly 3 digits', async () => {
    const dto = plainToInstance(DepositDto, buildPayload({ cardCvv: '12' }));

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'cardCvv')).toBe(true);
  });

  it('rejects an expiry that is not in MM/YY format', async () => {
    const dto = plainToInstance(
      DepositDto,
      buildPayload({ cardExpiry: '2030-12' }),
    );

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'cardExpiry')).toBe(true);
  });
});
