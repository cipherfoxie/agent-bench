import { applyDiscount } from '../discount.js';
export function priceFeature12(base: number): number {
  return applyDiscount(base, 12);
}
