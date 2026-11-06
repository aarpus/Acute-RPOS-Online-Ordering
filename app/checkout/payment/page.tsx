'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useStore, EmptyCart } from '../../../components/StoreProvider';
import OrderSummary, { PromoCode } from '../../../components/OrderSummary';
import { orderTotals, unitPrice, type SavedOrder } from '../../../lib/order';
import { authPagePath, storePath } from '../../../lib/checkout-auth';
import { validUSState, zipPattern } from '../../../lib/address';

export default function PaymentPage() {
  const store = useStore();
  const { data, cart, mode, customer, promo, formatPrice } = store;
  const method = 'cash';
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  if (!data) return null;
  if (!cart.length) return <EmptyCart />;
  if (!customer.name.trim() || customer.phone.replace(/\D/g, '').length < 7 || (mode === 'Delivery' && (!customer.street.trim() || !customer.city.trim() || !zipPattern.test(customer.postalCode) || !validUSState(customer.state)))) {
    return <main className="px-5 py-20 text-center"><h1 className="font-serif text-2xl">Complete your contact {mode === 'Delivery' ? 'and address' : ''} details first.</h1><Link href={storePath('/checkout',store.storeCode)} className="mt-5 inline-block text-red-700 underline">Go to Contact Details →</Link></main>;
  }
  const totals = orderTotals(cart, mode, promo, data);

  async function placeOrder() {
    if (!data || busy) return;
    setBusy(true); setError('');
    try {
      const payload = { items: cart.map((item) => ({ productId: item.product.id, sizeId: item.sizeId, extraIds: item.extraIds, instructions: item.instructions, quantity: item.quantity })), mode, customer, schedule: store.schedule, promo: '', paymentMethod: method, expectedTotal: totals.total, quotedUnitPrices: cart.map(unitPrice) };
      const fingerprint = JSON.stringify(payload), attemptKey = store.storageKey('checkout-attempt');
      try { if (!attempt.current) attempt.current = JSON.parse(sessionStorage.getItem(attemptKey) || 'null'); } catch {}
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
      try { sessionStorage.setItem(attemptKey, JSON.stringify(attempt.current)); } catch {}
      const response = await store.storeFetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, idempotencyKey: attempt.current.key }),
      });
      const result = await response.json() as SavedOrder & { error?: string };
      if (response.status === 401) { router.replace(authPagePath('/login','/checkout/payment',store.storeCode)); setBusy(false); return; }
      if (response.status === 409 && Array.isArray(result.items)) { store.setCart(result.items); store.setPromo(''); setError(result.error || 'Prices changed. Review and confirm again.'); setBusy(false); return; }
      if (!response.ok) throw Error(result.error || 'Unable to place the order.');
      // Keep the snapshot before clearing the cart so confirmation survives a refresh.
      store.setOrder(result);
      store.setCart([]);
      store.setPromo('');
      try { sessionStorage.setItem(store.storageKey('last-order-id'), result.id); sessionStorage.removeItem(attemptKey); } catch {}
      attempt.current = null;
      router.push(storePath('/order-confirmed', store.storeCode) + '&id=' + encodeURIComponent(result.id));
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); setBusy(false); }
  }
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-center font-serif text-3xl font-bold text-red-800">Payment</h1><p className="mt-2 mb-7 text-center text-sm text-gray-500">Choose a payment method to place your order.</p>
      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-lg border border-gray-200 p-5">
          <fieldset><legend className="mb-3 font-semibold text-red-700">Payment Method</legend><div className="space-y-3">{data.ordering.paymentMethods.map((option) => <label key={option.id} className={`flex cursor-pointer items-center gap-4 rounded-md border p-4 ${method === option.id ? 'border-red-700 bg-red-50' : 'border-gray-200'}`}><input name="payment-method" type="radio" checked={method === option.id} disabled={option.id !== 'cash'} readOnly className="size-4 accent-red-700" /><span className="text-2xl" aria-hidden="true">{option.id === 'card' ? '▤' : option.id === 'wallet' ? '▣' : '▱'}</span><span><strong className="block text-sm">{option.name}</strong><span className="text-xs text-gray-500">{option.description}{option.id !== 'cash' && ' - Coming soon'}</span></span></label>)}</div></fieldset>
          <PromoCode />
          <p data-notice-tone="warning" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Payment is collected when you receive your order. No online payment is charged.</p>
          <button disabled={busy} onClick={placeOrder} className="w-full rounded-lg bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-50">{busy ? 'Placing order…' : `Place Order · ${formatPrice(totals.total)} →`}</button>
          <p data-notice-tone={error ? 'error' : undefined} role="alert" className="mt-3 text-sm text-red-700">{error}</p><Link href={storePath('/checkout',store.storeCode)} className="mt-4 block text-center text-sm text-red-700 underline">← Edit contact / address</Link><Link href={storePath('/pickup',store.storeCode)} className="mt-2 block text-center text-xs text-gray-500 underline">Change delivery or pickup</Link>
        </section>
        <div><OrderSummary /><div className="mt-5 flex justify-around text-center text-xs text-gray-500"><span>◇<br />Secure Payments</span><span>♧<br />Your Data is Safe</span><span>☆<br />Freshly Prepared</span></div></div>
      </div>
    </main>
  );
}
