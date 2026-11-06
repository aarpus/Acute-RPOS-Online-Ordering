import type { HomeData, Product } from '../data/home';

export type CartItem = {
  id: string;
  product: Product;
  sizeId: string;
  extraIds: string[];
  instructions: string;
  quantity: number;
};
export type Customer = {
  name: string; phone: string; street: string; apartment: string;
  city: string; postalCode: string; instructions: string;
  state?: string; country?: string; landmark?: string;
};
export type Schedule = { timing: 'asap' | 'later'; date: string; time: string };
export type DemoOrder = {
  storeCode: string; storeName: string; storeAddress: string;
  id: string; createdAt: string; mode: string; customer: Customer;
  schedule: Schedule; paymentMethod: string; items: CartItem[];
  totals: ReturnType<typeof orderTotals>; demo: boolean;
};

export type OrderStatus = 'placed' | 'accepted' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled';
export type SavedOrder = Omit<DemoOrder, 'demo'> & {
  demo: false; orderNumber: string; status: OrderStatus; paymentStatus: 'pending' | 'paid';
  customerEmail: string; currency: string; confirmationSentAt: string | null;
  history: { id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; reason: string | null; createdAt: string }[];
  otp?: { status: string; expiresAt: string; lastSentAt: string | null; attemptsRemaining: number } | null;
};

export const orderStatusLabel: Record<OrderStatus, string> = {
  placed: 'Order Placed', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready',
  out_for_delivery: 'Out for Delivery', completed: 'Completed', cancelled: 'Cancelled',
};

export const emptyCustomer: Customer = {
  name: '', phone: '', street: '', apartment: '', city: '', postalCode: '', instructions: '',
};
export const emptySchedule: Schedule = { timing: 'asap', date: '', time: '' };

export function unitPrice(item: CartItem) {
  const size = item.product.sizes.find((size) => size.id === item.sizeId);
  const extras = item.product.extras.filter((extra) => item.extraIds.includes(extra.id));
  return Math.round(((size?.price ?? item.product.price) + extras.reduce((sum, extra) => sum + extra.price, 0)) * 100) / 100;
}

// Calculate in cents to keep money accurate. Also used by the demo order API.
export function orderTotals(items: CartItem[], mode: string, promo: string, data: HomeData) {
  const subtotal = items.reduce((sum, item) => sum + Math.round(unitPrice(item) * 100) * item.quantity, 0);
  const discount = data.ordering.promo.code && promo.toUpperCase() === data.ordering.promo.code
    ? Math.round(subtotal * data.ordering.promo.percent / 100) : 0;
  const fee = items.length && mode === 'Delivery' ? Math.round(data.ordering.deliveryFee * 100) : 0;
  return { subtotal: subtotal / 100, discount: discount / 100, fee: fee / 100, total: (subtotal - discount + fee) / 100 };
}

// Dates are generated at runtime; the screenshot's old example date is not used.
export function localDate(date = new Date(), timezone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function availableSlots(date: string, slots: string[], timezone = 'America/Los_Angeles') {
  const cutoff = new Date(Date.now() + 30 * 60 * 1000);
  const cutoffDate = localDate(cutoff, timezone);
  const cutoffTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(cutoff);
  return slots.filter((time) => date > cutoffDate || (date === cutoffDate && time > cutoffTime));
}
export function validSchedule(schedule: Schedule, data: HomeData) {
  if (schedule.timing === 'asap') return true;
  const last = new Date(Date.now() + (data.ordering.daysAhead - 1) * 24 * 60 * 60 * 1000);
  return schedule.date >= localDate(new Date(), data.store.timezone)
    && schedule.date <= localDate(last, data.store.timezone)
    && availableSlots(schedule.date, data.ordering.timeSlots, data.store.timezone).includes(schedule.time);
}
