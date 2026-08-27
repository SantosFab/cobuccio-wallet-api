import { addAmounts, isLessThan, subtractAmounts } from './money.util';

describe('money.util', () => {
  describe('addAmounts', () => {
    it('avoids classic floating point errors', () => {
      expect(addAmounts('0.10', '0.20')).toBe('0.30');
    });

    it('adds whole and fractional parts correctly', () => {
      expect(addAmounts('10.50', '5.75')).toBe('16.25');
    });

    it('recomposes a negative balance', () => {
      expect(addAmounts('-50.00', '30.00')).toBe('-20.00');
    });
  });

  describe('subtractAmounts', () => {
    it('subtracts correctly', () => {
      expect(subtractAmounts('100.00', '30.00')).toBe('70.00');
    });

    it('allows the result to go negative (reversal case)', () => {
      expect(subtractAmounts('0.00', '50.00')).toBe('-50.00');
    });

    it('subtracts from an already negative balance', () => {
      expect(subtractAmounts('-20.00', '30.00')).toBe('-50.00');
    });
  });

  describe('isLessThan', () => {
    it('returns true when the first amount is smaller', () => {
      expect(isLessThan('10.00', '20.00')).toBe(true);
    });

    it('returns false when the amounts are equal', () => {
      expect(isLessThan('20.00', '20.00')).toBe(false);
    });

    it('returns false when the first amount is larger', () => {
      expect(isLessThan('30.00', '20.00')).toBe(false);
    });

    it('treats a negative balance as less than any positive amount', () => {
      expect(isLessThan('-10.00', '0.01')).toBe(true);
    });
  });
});
