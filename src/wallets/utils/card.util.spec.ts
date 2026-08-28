import { isValidTestCard } from './card.util';

function futureExpiry(): string {
  const now = new Date();
  const year = String((now.getFullYear() + 1) % 100).padStart(2, '0');
  return `01/${year}`;
}

describe('card.util', () => {
  describe('isValidTestCard', () => {
    it('accepts the test card number with a valid cvv and future expiry', () => {
      expect(isValidTestCard('4242424242424242', '123', futureExpiry())).toBe(
        true,
      );
    });

    it('accepts the card number formatted with spaces', () => {
      expect(
        isValidTestCard('4242 4242 4242 4242', '123', futureExpiry()),
      ).toBe(true);
    });

    it('rejects any other card number', () => {
      expect(isValidTestCard('1111111111111111', '123', futureExpiry())).toBe(
        false,
      );
    });

    it('rejects a cvv that is not exactly 3 digits', () => {
      expect(isValidTestCard('4242424242424242', '12', futureExpiry())).toBe(
        false,
      );
      expect(isValidTestCard('4242424242424242', '1234', futureExpiry())).toBe(
        false,
      );
    });

    it('rejects a malformed expiry', () => {
      expect(isValidTestCard('4242424242424242', '123', '2030-01')).toBe(false);
    });

    it('rejects an invalid month', () => {
      expect(isValidTestCard('4242424242424242', '123', '13/30')).toBe(false);
    });

    it('rejects an expiry in the past', () => {
      expect(isValidTestCard('4242424242424242', '123', '01/20')).toBe(false);
    });
  });
});
