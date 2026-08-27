import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { TransferDto } from './transfer.dto';

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
});
