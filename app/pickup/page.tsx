'use client';

import { useRouter } from 'next/navigation';
import { useStore, EmptyCart } from '../../components/StoreProvider';
import OrderSummary from '../../components/OrderSummary';
import { storePath } from '../../lib/checkout-auth';

export default function PickupPage() {
  const { data, cart, mode, setMode, storeCode } = useStore();
  const router = useRouter();
  if (!data) return null;
  if (!cart.length) return <EmptyCart />;
  function confirm() {
    router.push(storePath('/checkout',storeCode));
  }
  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <h1 className="mb-6 font-serif text-3xl font-bold text-red-800 sm:text-4xl">Delivery &amp; Pickup</h1>
      <div className="grid gap-8 lg:grid-cols-[1.8fr_1fr]">
        <section>
          <div className="grid grid-cols-2 gap-3">{['Pickup', 'Delivery'].map((option) => <button key={option} onClick={() => setMode(option)} aria-pressed={mode === option} className={`rounded-lg border p-4 text-left ${mode === option ? 'border-red-700 bg-red-50' : 'border-gray-200'}`}><span className="font-serif text-xl font-bold">{option}</span><span className="mt-1 block text-sm text-gray-600">{option === 'Pickup' ? 'Pick up from our restaurant' : 'Get it delivered to your door'}</span></button>)}</div>
          <div className="my-5"><div><h2 className="font-serif text-3xl font-bold text-red-800">{data.store.name}</h2><p className="mt-3 text-sm">⌖ {data.store.address}</p><p className="mt-3 text-sm">◷ Open daily {data.store.hours}</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.store.address)}`} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-lg border border-red-700 px-5 py-3 font-semibold text-red-700">Get Directions ↗</a></div></div>
        </section>
        <OrderSummary><button onClick={confirm} className="mt-5 w-full rounded-lg bg-red-700 px-4 py-4 font-semibold text-white">Continue to Checkout →</button></OrderSummary>
      </div>
    </main>
  );
}
