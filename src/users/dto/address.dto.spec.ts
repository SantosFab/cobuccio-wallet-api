import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AddressDto } from './address.dto';

function buildValidPayload(): Record<string, unknown> {
  return {
    zipCode: '01310100',
    street: 'Avenida Paulista',
    number: '1000',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
  };
}

describe('AddressDto', () => {
  it('accepts a fully valid payload', async () => {
    const dto = plainToInstance(AddressDto, buildValidPayload());

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts a payload without the optional complement', async () => {
    const dto = plainToInstance(AddressDto, buildValidPayload());

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a zip code that is not exactly 8 digits', async () => {
    const dto = plainToInstance(AddressDto, {
      ...buildValidPayload(),
      zipCode: '123',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'zipCode')).toBe(true);
  });

  it('rejects a state outside the Brazilian UF list', async () => {
    const dto = plainToInstance(AddressDto, {
      ...buildValidPayload(),
      state: 'XX',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'state')).toBe(true);
  });

  it('rejects a street longer than the "street" column (varchar(255))', async () => {
    const dto = plainToInstance(AddressDto, {
      ...buildValidPayload(),
      street: 'A'.repeat(256),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'street')).toBe(true);
  });

  it('rejects a number longer than the "number" column (varchar(20))', async () => {
    const dto = plainToInstance(AddressDto, {
      ...buildValidPayload(),
      number: '1'.repeat(21),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'number')).toBe(true);
  });

  it('rejects a complement longer than the "complement" column (varchar(100))', async () => {
    const dto = plainToInstance(AddressDto, {
      ...buildValidPayload(),
      complement: 'A'.repeat(101),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'complement')).toBe(true);
  });

  it('rejects a neighborhood longer than the "neighborhood" column (varchar(100))', async () => {
    const dto = plainToInstance(AddressDto, {
      ...buildValidPayload(),
      neighborhood: 'A'.repeat(101),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'neighborhood')).toBe(
      true,
    );
  });

  it('rejects a city longer than the "city" column (varchar(100))', async () => {
    const dto = plainToInstance(AddressDto, {
      ...buildValidPayload(),
      city: 'A'.repeat(101),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'city')).toBe(true);
  });
});
