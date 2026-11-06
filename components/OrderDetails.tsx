'use client';

import { useStore } from './StoreProvider';
import { unitPrice, type SavedOrder } from '../lib/order';

export default function OrderDetails({ order }: { order: SavedOrder }) {
  const { formatPrice } = useStore();
  return <section className="rounded-lg border border-gray-200 p-5"><h2 className="mb-3 font-semibold text-red-700">Order Details ({order.items.reduce((sum, item) => sum + item.quantity, 0)} items)</h2>{order.items.map((item) => <div key={item.id} className="flex gap-3 border-b border-gray-100 py-3"><img src={item.product.image} alt="" className="h-14 w-16 rounded object-cover" /><div className="flex-1"><h3 className="text-sm font-semibold">{item.product.name}</h3><p className="text-xs text-gray-500">{item.product.sizes.find((size) => size.id === item.sizeId)?.name}{item.extraIds.map((id) => ' · ' + item.product.extras.find((extra) => extra.id === id)?.name)} · Qty {item.quantity}</p>{item.instructions && <p className="mt-1 text-xs text-gray-500">{item.instructions}</p>}</div><strong className="text-sm">{formatPrice(unitPrice(item) * item.quantity)}</strong></div>)}<dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPrice(order.totals.subtotal)}</dd></div>{order.totals.discount > 0 && <div className="flex justify-between text-green-700"><dt>Discount</dt><dd>−{formatPrice(order.totals.discount)}</dd></div>}<div className="flex justify-between"><dt>{order.mode} Fee</dt><dd>{order.totals.fee ? formatPrice(order.totals.fee) : 'Free'}</dd></div><div className="flex justify-between border-t border-gray-200 pt-3 text-lg font-bold text-red-700"><dt>Total</dt><dd>{formatPrice(order.totals.total)}</dd></div></dl></section>;
}
