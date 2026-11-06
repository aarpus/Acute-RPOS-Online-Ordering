export type PriceAdjustment = 'Increase by Percentage' | 'Decrease by Percentage' | 'Increase by Amount' | 'Decrease by Amount' | 'Set Price';

export function adjustedPrice(price: number, adjustment: PriceAdjustment, amount: number) {
  if (!Number.isFinite(price) || !Number.isFinite(amount) || price < 0 || amount < 0) return 0;
  const value = adjustment === 'Increase by Percentage' ? price * (1 + amount / 100)
    : adjustment === 'Decrease by Percentage' ? price * (1 - amount / 100)
    : adjustment === 'Increase by Amount' ? price + amount
    : adjustment === 'Decrease by Amount' ? price - amount : amount;
  return Math.max(0, Math.round((value + Number.EPSILON) * 100) / 100);
}
