export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Not Tracked';

export function inventoryStatus(stock: number, minimum: number, tracked = true): StockStatus {
  if (!tracked) return 'Not Tracked';
  if (stock <= 0) return 'Out of Stock';
  return stock <= minimum ? 'Low Stock' : 'In Stock';
}
