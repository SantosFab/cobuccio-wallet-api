// Simulated payment gateway, not a real one — the only "accepted" card
// is Stripe's classic test number, 4242 4242 4242 4242.
const TEST_CARD_NUMBER = '4242424242424242';

export function isValidTestCard(
  cardNumber: string,
  cvv: string,
  expiry: string,
): boolean {
  if (cardNumber.replace(/\D/g, '') !== TEST_CARD_NUMBER) return false;
  if (!/^\d{3}$/.test(cvv)) return false;

  const match = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!match) return false;

  const [, monthPart, yearPart] = match;
  const month = Number(monthPart);
  if (month < 1 || month > 12) return false;

  // First day of the month AFTER the printed expiry — a card expiring
  // "12/26" is still valid through the end of December 2026.
  const expiresAt = new Date(2000 + Number(yearPart), month, 1);
  return expiresAt > new Date();
}
