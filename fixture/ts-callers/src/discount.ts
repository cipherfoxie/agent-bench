export function applyDiscount(price: number, pct: number): number {
  return Math.round(price * (1 - pct / 100));
}
