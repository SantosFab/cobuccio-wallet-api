import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MAX_AMOUNT, TransferDto } from './transfer.dto';

function buildValidPayload(): Record<string, unknown> {
  return { recipientIdentifier: 'ana@example.com', amount: 50 };
}

describe('TransferDto', () => {
  it('accepts an email as the recipient identifier', async () => {
    const dto = plainToInstance(TransferDto, buildValidPayload());

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts a CPF as the recipient identifier', async () => {
    const dto = plainToInstance(TransferDto, {
      ...buildValidPayload(),
      recipientIdentifier: '52998224725',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an empty recipient identifier', async () => {
    const dto = plainToInstance(TransferDto, {
      ...buildValidPayload(),
      recipientIdentifier: '',
    });

    const errors = await validate(dto);

    expect(
      errors.some((error) => error.property === 'recipientIdentifier'),
    ).toBe(true);
  });

  it('rejects a non-positive amount', async () => {
    const dto = plainToInstance(TransferDto, {
      ...buildValidPayload(),
      amount: 0,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('accepts an amount right at the maximum', async () => {
    const dto = plainToInstance(TransferDto, {
      ...buildValidPayload(),
      amount: MAX_AMOUNT,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an amount above the maximum', async () => {
    const dto = plainToInstance(TransferDto, {
      ...buildValidPayload(),
      amount: MAX_AMOUNT + 0.01,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('rejects an absurdly large amount that would break money.util.ts arithmetic', async () => {
    const dto = plainToInstance(TransferDto, {
      ...buildValidPayload(),
      amount: 1e21,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });
});
