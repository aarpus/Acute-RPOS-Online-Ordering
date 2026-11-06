'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSavedOrder } from '../../components/useSavedOrder';
import { storePath } from '../../lib/checkout-auth';
import { orderStatusLabel } from '../../lib/order';
import { useStore } from '../../components/StoreProvider';
import OrderDetails from '../../components/OrderDetails';

export default function ConfirmationPage() {
  const { data, formatPrice, storeCode, storeFetch } = useStore();
  const { order, loading, error, reload } = useSavedOrder();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function retryEmail() {
    if (!order || busy) return;
    setBusy(true); setNotice('');
    try {
      const response = await storeFetch('/api/orders/' + order.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirmation' }) });
      const result = await response.json() as { error?: string; message: string };
      if (!response.ok) throw Error(result.error || 'Unable to send email.');
      setNotice(result.message); await reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to send email.'); }
    finally { setBusy(false); }
  }
  if (!data) return null;
  if (!order) return <main className="px-5 py-20 text-center"><h1 className="font-serif text-2xl">{loading ? 'Loading order...' : error || 'No order selected'}</h1><Link href="/" className="mt-4 inline-block text-red-700 underline">Explore the menu →</Link></main>;
  const customer = order.customer;
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="text-center"><span className="inline-grid size-16 place-content-center rounded-full bg-green-600 text-4xl text-white">✓</span><h1 className="mt-3 font-serif text-3xl font-bold text-red-800">Order Placed!</h1><p className="mt-2 text-sm text-gray-500">Your order has been saved. Track its progress below.</p></div>
      <div className="mx-auto mt-5 grid max-w-3xl gap-4 rounded-lg border border-red-100 bg-red-50 p-4 text-center sm:grid-cols-2"><div><p className="text-xs text-red-700">Order ID</p><strong className="text-xl text-red-800">{order.orderNumber}</strong></div><div><p className="text-xs text-red-700">{order.status === 'cancelled' ? 'No payment due' : order.paymentStatus === 'paid' ? 'Payment received' : 'Due on ' + order.mode}</p><strong className="text-xl text-red-800">{formatPrice(order.totals.total)}</strong><span className="ml-3 rounded bg-green-600 px-2 py-1 text-xs text-white">{order.status === 'cancelled' ? 'Cancelled' : order.paymentStatus === 'paid' ? 'Paid' : 'Pay later'}</span></div></div>
      <p data-notice-tone="warning" className="mx-auto mt-3 max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">{orderStatusLabel[order.status]} | {order.confirmationSentAt ? 'Confirmation email sent.' : 'Confirmation email has not been sent yet.'} <button disabled={busy} onClick={retryEmail} className="ml-2 underline disabled:opacity-50">{busy ? 'Sending...' : 'Resend confirmation'}</button>{notice && <span role="status" className="block mt-2">{notice}</span>}</p>
      <div className="mt-6 grid items-start gap-5 md:grid-cols-2"><section className="rounded-lg border border-gray-200 p-5"><h2 className="mb-3 font-semibold text-red-700">{order.mode === 'Delivery' ? 'Delivery Address' : 'Pickup Details'}</h2><p className="font-semibold">{customer.name}</p><p className="mt-1 text-sm text-gray-600">{customer.phone}</p><p className="mt-2 text-sm">{order.mode === 'Delivery' ? [customer.street, customer.apartment, customer.city, customer.state, customer.postalCode, customer.landmark].filter(Boolean).join(', ') : order.storeAddress}</p><p className="mt-3 text-sm text-gray-500">{customer.instructions}</p><p className="mt-4 text-sm font-semibold">{order.schedule.timing === 'asap' ? `ASAP · ${order.mode === 'Pickup' ? data.ordering.readyMinutes : data.ordering.deliveryMinutes}` : `${order.schedule.date} at ${order.schedule.time}`}</p></section><OrderDetails order={order} /></div>
      <div className="mt-6 text-center"><Link href={storePath('/track-order', storeCode) + '&id=' + encodeURIComponent(order.id)} className="inline-block rounded-lg bg-red-700 px-12 py-3 font-semibold text-white">Track Order →</Link><Link href="/" className="mt-3 block text-sm text-red-700 underline">Continue to Home</Link></div>
    </main>
  );
}
