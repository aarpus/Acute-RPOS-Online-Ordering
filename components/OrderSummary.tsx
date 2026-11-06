'use client';

import Link from 'next/link';
import { useStore } from './StoreProvider';
import { orderTotals, unitPrice } from '../lib/order';

export function PromoCode() {
  return <p className="my-5 text-sm text-gray-500">Coupon redemption is not available.</p>;
}

export default function OrderSummary({ showItems = true, showPromo = false, children }: { showItems?: boolean; showPromo?: boolean; children?: React.ReactNode }) {
  const { data, cart, mode, promo, formatPrice } = useStore();
  if (!data) return null;
  const totals = orderTotals(cart, mode, promo, data);
  return (
    <aside className="self-start rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-serif text-2xl font-bold">{showItems ? 'Your Order' : 'Order Summary'}</h2>{showItems && <Link href="/cart" className="text-sm text-red-700 underline">Edit Cart</Link>}</div>
      {showItems && cart.map((item) => <div key={item.id} className="flex gap-3 border-t border-gray-100 py-4"><img src={item.product.image} alt="" className="h-16 w-20 rounded-md object-cover" /><div className="min-w-0 flex-1"><h3 className="font-serif font-bold">{item.product.name}</h3><p className="mt-1 text-xs text-gray-500">{item.product.sizes.find((size) => size.id === item.sizeId)?.name}{item.extraIds.map((id) => ' · ' + item.product.extras.find((extra) => extra.id === id)?.name)}</p><p className="mt-1 text-xs text-gray-500">Qty: {item.quantity}</p></div><strong className="text-sm">{formatPrice(unitPrice(item) * item.quantity)}</strong></div>)}
      <dl className="space-y-3 border-t border-gray-200 pt-4 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPrice(totals.subtotal)}</dd></div>{totals.discount > 0 && <div className="flex justify-between text-green-700"><dt>Discount ({promo})</dt><dd>−{formatPrice(totals.discount)}</dd></div>}<div className="flex justify-between"><dt>{mode}</dt><dd>{totals.fee ? formatPrice(totals.fee) : 'Free'}</dd></div></dl>
      {showPromo && <PromoCode />}
      <div className="mt-5 flex justify-between border-t border-gray-200 pt-4 font-serif text-2xl font-bold"><span>Total</span><span className="text-red-700">{formatPrice(totals.total)}</span></div>
      {children}
      <p className="mt-4 text-center text-xs text-gray-500">⌑ Secure ordering · No hidden charges</p>
    </aside>
  );
}
