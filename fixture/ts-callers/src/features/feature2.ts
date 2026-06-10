import { applyDiscount } from '../discount.js';
export function priceFeature2(base: number): number {
  return applyDiscount(base, 2);
}
