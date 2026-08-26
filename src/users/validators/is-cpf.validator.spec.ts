import { isValidCpf } from './is-cpf.validator';

describe('isValidCpf', () => {
  it('accepts a mathematically valid CPF, with or without mask', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('rejects a CPF with wrong check digits', () => {
    expect(isValidCpf('52998224700')).toBe(false);
  });

  it('rejects CPFs with all repeated digits', () => {
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
  });

  it('rejects values with the wrong length', () => {
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('529982247250')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidCpf(undefined as unknown as string)).toBe(false);
    expect(isValidCpf(null as unknown as string)).toBe(false);
  });
});
