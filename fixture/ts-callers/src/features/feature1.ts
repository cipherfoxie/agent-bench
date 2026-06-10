import { applyDiscount } from '../discount.js';
export function priceFeature1(base: number): number {
  return applyDiscount(base, 1);
}
