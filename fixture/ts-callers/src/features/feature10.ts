import { applyDiscount } from '../discount.js';
export function priceFeature10(base: number): number {
  return applyDiscount(base, 10);
}
