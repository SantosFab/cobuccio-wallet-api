// Never add/subtract/compare the decimal strings directly — floating
// point (e.g. 0.10 + 0.20 !== 0.30). Convert to integer cents, operate,
// convert back.
function toCents(amount: string): number {
  const isNegative = amount.startsWith('-');
  const [wholePart, fractionalPart = '0'] = amount
    .slice(isNegative ? 1 : 0)
    .split('.');
  const cents =
    Number(wholePart) * 100 + Number(fractionalPart.padEnd(2, '0').slice(0, 2));
  return isNegative ? -cents : cents;
}

function fromCents(cents: number): string {
  const isNegative = cents < 0;
  const absoluteCents = Math.abs(cents);
  const wholePart = Math.floor(absoluteCents / 100);
  const fractionalPart = String(absoluteCents % 100).padStart(2, '0');
  return `${isNegative ? '-' : ''}${wholePart}.${fractionalPart}`;
}

export function addAmounts(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function subtractAmounts(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function isLessThan(a: string, b: string): boolean {
  return toCents(a) < toCents(b);
}
