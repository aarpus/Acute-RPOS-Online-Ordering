'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { addressCustomer, usStates, type SavedAddress } from '../../lib/address';
import { useRouter } from 'next/navigation';
import { useStore, EmptyCart } from '../../components/StoreProvider';
import OrderSummary from '../../components/OrderSummary';
import { type Customer } from '../../lib/order';
import { storePath } from '../../lib/checkout-auth';

export default function CheckoutPage() {
  const { data, cart, mode, customer, setCustomer, storeCode } = useStore();
  const router = useRouter();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/addresses', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const result = await response.json() as { addresses: SavedAddress[] };
      if (controller.signal.aborted) return;
      setAddresses(result.addresses);
      const preferred = result.addresses.find(address => address.isDefault);
      if (preferred) setCustomer(previous => previous.street.trim() ? previous : addressCustomer(preferred));
    }).catch(() => {});
    return () => controller.abort();
  }, [storeCode, setCustomer]);
  if (!data) return null;
  if (!cart.length) return <EmptyCart />;
  const address = [customer.apartment, customer.street, customer.city, customer.state, customer.postalCode, customer.landmark].filter(Boolean).join(', ');
  const inputClass = 'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
  function field(key: keyof Customer, label: string, required = true, type = 'text') {
    return <label className="block text-sm text-gray-700">{label}<input name={key} type={type} required={required} maxLength={key === 'phone' ? 25 : key === 'city' ? 100 : key === 'street' ? 200 : 150} pattern={key === 'phone' ? '[+0-9 ()-]{7,25}' : key === 'postalCode' ? '[0-9]{5}(-[0-9]{4})?' : undefined} value={customer[key] || ''} onChange={(event) => setCustomer({ ...customer, [key]: event.target.value })} className={inputClass} /></label>;
  }
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-center font-serif text-3xl font-bold text-red-800">{mode === 'Delivery' ? 'Delivery Address' : 'Contact Details'}</h1><p className="mt-2 mb-7 text-center text-sm text-gray-500">{mode === 'Delivery' ? 'Almost there! Tell us where to deliver your order.' : 'Tell us who will collect your order.'}</p>
      <form onSubmit={(event) => { event.preventDefault(); router.push(storePath('/checkout/payment',storeCode)); }} className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="space-y-5 rounded-lg border border-gray-200 p-5">
          <h2 className="font-semibold text-red-700">Contact Details</h2><div className="grid gap-4 sm:grid-cols-2">{field('name', 'Full Name')}{field('phone', 'Phone Number', true, 'tel')}</div>
          {mode === 'Delivery' && <><h2 className="font-semibold text-red-700">Delivery Address</h2>{addresses.length > 0 && <label className="block text-sm text-gray-700">Saved addresses<select defaultValue="" className={inputClass} onChange={event => { const selected = addresses.find(address => address.id === event.target.value); if (selected) setCustomer(addressCustomer(selected)); }}><option value="">Select a saved address</option>{addresses.map(address => <option key={address.id} value={address.id}>{address.addressType} — {address.flatHouseNo}, {address.areaStreet}{address.isDefault ? ' (Default)' : ''}</option>)}</select></label>}{field('street', 'Street Address')}{field('apartment', 'Apartment / Suite (Optional)', false)}<div className="grid gap-4 sm:grid-cols-2">{field('city', 'City')}{field('postalCode', 'ZIP Code')}</div><label className="block text-sm text-gray-700">State<select required value={customer.state || ''} className={inputClass} onChange={event => setCustomer({ ...customer, state: event.target.value, country: 'US' })}><option value="">Select state</option>{Object.entries(usStates).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><div><h3 className="mb-2 text-sm font-semibold">Location Preview</h3><div className="rounded-lg border border-gray-200 bg-slate-50 p-4"><span className="text-red-700">⌖</span> <span className="text-sm text-gray-600">{address || 'Enter your address above to preview it here.'}</span><p className="mt-2 text-xs text-gray-400">United States delivery address.</p></div></div></>}
          <label className="block text-sm text-gray-700">{mode === 'Delivery' ? 'Delivery' : 'Pickup'} Instructions (Optional)<textarea maxLength={200} value={customer.instructions} onChange={(event) => setCustomer({ ...customer, instructions: event.target.value })} className={inputClass} placeholder={mode === 'Delivery' ? 'Ring the bell. Leave at the door…' : 'Anything we should know?'} /><span className="block text-right text-xs text-gray-400">{customer.instructions.length}/200</span></label>
        </section>
        <OrderSummary><p className="mt-4 text-xs text-gray-500">{mode}</p><button type="submit" className="mt-4 w-full rounded-lg bg-red-700 px-4 py-3 font-semibold text-white">Continue to Payment →</button><Link href={storePath('/pickup',storeCode)} className="mt-3 block text-center text-sm text-red-700 underline">Change delivery or pickup</Link></OrderSummary>
      </form>
    </main>
  );
}
