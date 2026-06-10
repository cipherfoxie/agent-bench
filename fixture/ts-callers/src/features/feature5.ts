import { applyDiscount } from '../discount.js';
export function priceFeature5(base: number): number {
  return applyDiscount(base, 5);
}
