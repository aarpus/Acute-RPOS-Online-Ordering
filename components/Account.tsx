'use client';
import { getNoticeTone } from '../lib/notices';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authPagePath, checkoutReturnPath, storePath } from '../lib/checkout-auth';
import { useStore } from './StoreProvider';
import { unitPrice, orderStatusLabel, type SavedOrder } from '../lib/order';

import { blankAddress, addressCustomer, usStates, type SavedAddress as Address } from '../lib/address';
type Profile = { name: string; phone: string; email: string };
type AuthUser = { id: string; firstName: string; lastName: string; phoneNumber: string; email: string };

function profileFromUser(user: AuthUser): Profile {
  return { name: `${user.firstName} ${user.lastName}`.trim(), phone: user.phoneNumber, email: user.email };
}
const input = 'mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5';
const button = 'rounded-md bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800';
const outline = 'rounded-md border border-red-600 px-4 py-2 text-sm text-red-700 hover:bg-red-50';

export default function Account({ login = false }: { login?: boolean }) {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const returnPath = checkoutReturnPath(params.get('next'));
  const returnUrl = storePath(returnPath,store.storeCode);
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [addressUserId, setAddressUserId] = useState('');
  const [tab, setTab] = useState('Profile');
  const [profile, setProfile] = useState<Profile>({ name: '', phone: '', email: '' });
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selected, setSelected] = useState<SavedOrder | null>(null);
  const [edit, setEdit] = useState(false);
  const [address, setAddress] = useState<Address | null>(null);
  const [notice, setNotice] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  async function addressRequest(path = '', method = 'GET', body?: Address) {
    const response = await fetch('/api/addresses' + path, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json() as { error?: string; addresses: Address[] };
    if (!response.ok) throw Error(result.error || 'Unable to load saved addresses.');
    setAddresses(result.addresses);
  }
  async function changeAddress(path: string, method: string, body?: Address) {
    if (addressBusy) return;
    setAddressBusy(true); setNotice('');
    try {
      await addressRequest(path, method, body);
      if (method === 'POST' || method === 'PUT') setAddress(null);
      setNotice(method === 'DELETE' ? 'Address deleted.' : 'Address saved.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save address.'); }
    finally { setAddressBusy(false); }
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await store.storeFetch('/api/auth/session');
        const result = await response.json() as { user?: AuthUser | null };
        if (!cancelled && response.ok && result.user) {
          setSignedIn(true);
          setAddressUserId(result.user.id);
          setProfile(profileFromUser(result.user));
        }
        const saved = JSON.parse(sessionStorage.getItem(store.storageKey('spice-account')) || 'null');
        if (saved) {
          if (!result.user) setProfile(saved.profile);


        }
        if (result.user) await addressRequest().catch(error => { if (!cancelled) setNotice(error.message); });

      } catch { if (!cancelled) setNotice('Saved account data could not be loaded.'); }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { sessionStorage.setItem(store.storageKey('spice-account'), JSON.stringify({ profile })); } catch { setNotice('Browser storage is unavailable; changes may not survive refresh.'); }
  }, [loaded, profile]);
  useEffect(() => {
    if (!signedIn || tab !== 'My Orders') return;
    const controller = new AbortController();
    setOrdersLoading(true);
    store.storeFetch('/api/orders?page=' + orderPage, { signal: controller.signal }).then(async response => {
      const result = await response.json() as { error?: string; orders: SavedOrder[]; total: number };
      if (!response.ok) throw Error(result.error || 'Unable to load orders.');
      if (!controller.signal.aborted) { setOrders(result.orders); setOrderTotal(result.total); }
    }).catch(error => { if (!controller.signal.aborted) { setOrders([]); setNotice(error.message); } }).finally(() => { if (!controller.signal.aborted) setOrdersLoading(false); });
    return () => controller.abort();
  }, [signedIn, tab, orderPage, store.storeFetch]);
  async function selectOrder(id: string) {
    try {
      const response = await store.storeFetch('/api/orders/' + id);
      const result = await response.json() as SavedOrder & { error?: string };
      if (!response.ok) throw Error(result.error || 'Unable to load order.');
      setSelected(result);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load order.'); }
  }
  useEffect(()=>{if(login && loaded && signedIn) router.replace(returnUrl);},[login,loaded,signedIn,returnUrl,router]);
  if (!loaded) return <p className="p-10">Loading account…</p>;
  if (login && signedIn) return <p className="p-10" role="status">Continuing…</p>;
  if (!signedIn || login) return <main className="mx-auto max-w-sm px-5 py-16">
    <h1 className="text-center font-serif text-4xl font-bold text-red-900">Login</h1>
    <p className="mt-3 text-center text-gray-600">Sign in to your {store.data.store.name} account</p>
    <form className="mt-8 space-y-5" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setLoggingIn(true);
      setNotice('');
      try {
        const response = await store.storeFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: String(form.get('email') ?? ''),
            password: String(form.get('password') ?? ''),
          }),
        });
        const result = await response.json() as { error?: string; user?: AuthUser };
        if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
        if (result.user) setProfile(profileFromUser(result.user));
        setSignedIn(true);
        router.replace(returnUrl);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Unable to sign in.');
      } finally {
        setLoggingIn(false);
      }
    }}>
      <label className="block text-sm">Email address<input name="email" type="email" autoComplete="email" required className={input} /></label>
      <label className="block text-sm">Password<input name="password" type="password" autoComplete="current-password" required className={input} /></label>
      <button className={button + ' w-full'} disabled={loggingIn}>{loggingIn ? 'Signing in…' : 'Login'}</button>
    </form>
    <p className="mt-5 text-center text-sm text-gray-600">
      Not registered yet?{' '}
      <Link href={authPagePath('/register',returnPath,store.storeCode)} className="font-semibold text-red-700 hover:text-red-900">Create an account</Link>
    </p>
    <p data-notice-tone={notice ? getNoticeTone(notice) : undefined} role="status" className="mt-3 text-sm text-red-700">{notice}</p>
  </main>;
  function reorder(order: SavedOrder) {
    const items = order.items.flatMap(item => {
      const selectedExtras = item.extraIds.filter(id => !id.startsWith('fixed:'));
      const product = store.data?.products.find(product => product.id === item.product.id);
      if (!product || !product.sizes.some(size => size.id === item.sizeId) || selectedExtras.some(id => !product.extras.some(extra => extra.id === id))) return [];
      return [{ ...item, id: crypto.randomUUID(), product, extraIds: selectedExtras }];
    });
    if (!items.length) { setNotice('These products are no longer available.'); return; }
    if (items.length !== order.items.length) { setNotice('Some items are unavailable. Please add the available products from the menu.'); return; }
    items.forEach(store.addItem); router.push(storePath('/cart', store.storeCode));
  }
  return <main className="mx-auto grid max-w-7xl gap-6 px-5 py-8 md:grid-cols-[210px_1fr]">
    <aside className="flex flex-wrap gap-2 border-gray-200 md:block md:space-y-2 md:border-r md:pr-5">
      {['Profile', 'My Orders', 'Saved Addresses', 'Help'].map(label => <button key={label} onClick={() => { setTab(label); setSelected(null); setNotice(''); }} className={'block rounded-md px-4 py-3 text-left text-sm md:w-full ' + (tab === label ? 'bg-red-50 font-semibold text-red-700' : 'hover:bg-gray-50')}>{label}</button>)}
      <button className="px-4 py-3 text-sm text-red-700" onClick={async () => { await store.storeFetch('/api/auth/logout', { method: 'POST' }); setSignedIn(false); setOrders([]); setSelected(null); store.setOrder(null); router.push('/login'); }}>Logout</button>
    </aside>
    <section className="min-w-0">
      <p data-notice-tone={notice ? getNoticeTone(notice) : undefined} role="status" className="mb-3 text-sm text-red-700">{notice}</p>
      {tab === 'Profile' && <><div className="flex items-center justify-between"><h1 className="font-serif text-3xl font-bold text-red-900">Profile</h1><button className={outline} onClick={() => setEdit(!edit)}>{edit ? 'Cancel' : 'Edit'}</button></div><p className="mt-2 text-gray-600">Keep your information up to date for a smoother ordering experience.</p>
        <form className="my-6 grid gap-5 rounded-lg border border-gray-200 p-5 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const next = { name: String(form.get('name')).trim(), phone: String(form.get('phone')).trim(), email: String(form.get('email')).trim() }; if (!next.name) return; setProfile(next); store.setCustomer({ ...store.customer, name: next.name, phone: next.phone }); setEdit(false); setNotice('Profile saved.'); }}>
          <label className="text-sm">Full name<input key={profile.name + String(edit)} defaultValue={profile.name} disabled={!edit} name="name" required maxLength={150} className={input} /></label>
          <label className="text-sm">Mobile number<input key={profile.phone + String(edit)} defaultValue={profile.phone} disabled={!edit} name="phone" type="tel" required pattern="[+0-9 ()-]{7,25}" className={input} /></label>
          <label className="text-sm">Email address<input key={profile.email + String(edit)} defaultValue={profile.email} disabled={!edit} name="email" type="email" required maxLength={150} className={input} /></label>
          {edit && <button className={button}>Save profile</button>}
        </form></>}
      {(tab === 'Profile' || tab === 'Saved Addresses') && <><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-3xl font-bold text-red-900">Saved Addresses</h2><button className={button} onClick={() => setAddress({ ...blankAddress, shippingName: profile.name, shippingPhone: profile.phone })}>＋ Add new address</button></div><p className="mt-2 text-gray-600">Manage your delivery and pickup addresses.</p>
        <div className="my-5 grid gap-4 sm:grid-cols-2">{!addresses.length && <p className="py-6 text-gray-500">No saved addresses yet.</p>}{addresses.map(entry => <article key={entry.id} className="rounded-lg border border-gray-200 p-5"><h3 className="font-semibold">{entry.addressType} {entry.isDefault && <span className="ml-2 rounded bg-green-50 px-2 py-1 text-xs text-green-700">Default</span>}</h3><p className="my-3 whitespace-pre-line text-sm leading-6 text-gray-600">{entry.flatHouseNo}, {entry.areaStreet}<br />{entry.city}, {entry.state} {entry.pincode}</p><div className="flex flex-wrap gap-3 border-t border-gray-100 pt-3"><button className="text-sm text-red-700" onClick={() => setAddress(entry)}>Edit</button><button className="text-sm text-red-700" disabled={addressBusy} onClick={() => { if (window.confirm('Delete this address?')) void changeAddress('/' + entry.id, 'DELETE'); }}>Delete</button><button className="text-sm text-red-700" onClick={() => { store.setCustomer(addressCustomer(entry)); store.setCustomerUserId(addressUserId); setNotice('Address selected for checkout.'); }}>Use at checkout</button></div></article>)}</div>
        {address && <form className="space-y-3 rounded-lg border border-red-200 p-5" onSubmit={event => { event.preventDefault(); void changeAddress(address.id ? '/' + address.id : '', address.id ? 'PUT' : 'POST', address); }}><h3 className="font-semibold">{address.id ? 'Edit address' : 'New address'}</h3><div className="grid gap-4 sm:grid-cols-2">{([
          ['addressType', 'Label (Home / Work)', 20, true], ['shippingName', 'Recipient name', 100, true], ['shippingPhone', 'Phone number', 25, true],
          ['flatHouseNo', 'Flat / House number', 150, true], ['areaStreet', 'Area / Street', 200, true], ['landmark', 'Landmark (Optional)', 150, false],
          ['city', 'City', 100, true], ['pincode', 'ZIP Code', 25, true], ['deliveryInstructions', 'Delivery instructions (Optional)', 200, false],
        ] as const).map(([key, label, max, required]) => <label key={key} className="text-sm">{label}<input required={required} maxLength={max} type={key === 'shippingPhone' ? 'tel' : 'text'} pattern={key === 'pincode' ? '[0-9]{5}(-[0-9]{4})?' : key === 'shippingPhone' ? '[+0-9 ()-]{7,25}' : undefined} value={address[key] || ''} className={input} onChange={event => setAddress({ ...address, [key]: event.target.value })} /></label>)}
          <label className="text-sm">State<select required value={address.state} className={input} onChange={event => setAddress({ ...address, state: event.target.value })}><option value="">Select state</option>{Object.entries(usStates).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          <label className="text-sm">Country<input readOnly value="US" className={input} /></label></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={address.isDefault} onChange={event => setAddress({ ...address, isDefault: event.target.checked })} />Set as default</label><div className="flex gap-3"><button disabled={addressBusy} className={button}>Save address</button><button type="button" className={outline} onClick={() => setAddress(null)}>Cancel</button></div></form>}
      </>}
      {tab === 'My Orders' && !selected && <>{ordersLoading && <p role="status" className="py-4 text-gray-500">Loading orders...</p>}<h1 className="font-serif text-3xl font-bold text-red-900">My Orders</h1><p className="my-3 text-gray-600">View your past orders and reorder your favourites.</p>{!ordersLoading && !orders.length && <div className="rounded-lg border border-gray-200 p-8"><p>No orders yet. Place an order to see it here.</p><a href="/" className="mt-4 inline-block text-red-700">Explore menu →</a></div>}<div className="space-y-4">{orders.map(order => <article key={order.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 p-4"><img src={order.items[0]?.product.image} alt="" className="size-20 rounded-lg object-cover" /><div className="flex-1"><h2 className="font-semibold">Order #{order.orderNumber}</h2><p className="my-1 text-sm text-gray-600">{new Date(order.createdAt).toLocaleString()}</p><p className="text-sm">{order.items.reduce((sum, item) => sum + item.quantity, 0)} items · {store.formatPrice(order.totals.total)}</p></div><div><p className="mb-3 text-sm text-green-700">{orderStatusLabel[order.status]}</p><div className="flex gap-3"><button className={outline} onClick={() => void selectOrder(order.id)}>View details</button><button className={button} onClick={() => reorder(order)}>Reorder</button></div></div></article>)}</div>{orderTotal > 20 && <div className="mt-4 flex items-center justify-between"><button className={outline} disabled={orderPage === 1 || ordersLoading} onClick={() => setOrderPage(page => page - 1)}>Previous</button><span className="text-sm text-gray-500">Page {orderPage} of {Math.ceil(orderTotal / 20)}</span><button className={outline} disabled={orderPage * 20 >= orderTotal || ordersLoading} onClick={() => setOrderPage(page => page + 1)}>Next</button></div>}</>}
      {tab === 'My Orders' && selected && <><button className="mb-4 text-sm" onClick={() => setSelected(null)}>← Back to My Orders</button><h1 className="font-serif text-3xl font-bold text-red-900">Order #{selected.orderNumber}</h1><p className="my-3 text-sm text-gray-600">{new Date(selected.createdAt).toLocaleString()} · {selected.mode}</p><div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]"><div className="space-y-4 rounded-lg border border-gray-200 p-4"><h2 className="font-semibold">Order items</h2>{selected.items.map((item, index) => <div key={index} className="flex gap-3"><img src={item.product.image} alt="" className="size-16 rounded object-cover" /><div className="flex-1"><p className="font-medium">{item.product.name}</p><p className="text-sm text-gray-500">{item.product.sizes.find(size => size.id === item.sizeId)?.name} · Qty: {item.quantity}</p>{item.product.extras.filter(extra => item.extraIds.includes(extra.id)).map(extra => <p key={extra.id} className="text-sm text-gray-500">＋ {extra.name}</p>)}<p className="text-sm text-gray-500">{item.instructions}</p></div><p>{store.formatPrice(unitPrice(item) * item.quantity)}</p></div>)}</div><div className="space-y-4 rounded-lg border border-gray-200 p-4"><h2 className="font-semibold">Payment & {selected.mode} information</h2><p className="text-sm">Method: {selected.paymentMethod} · {selected.paymentStatus === 'paid' ? 'Paid' : 'Payment pending'}</p><p className="font-semibold">Total: {store.formatPrice(selected.totals.total)}</p><p className="text-sm">{selected.customer.name}<br />{selected.customer.phone}</p><p className="text-sm">{selected.mode === 'Pickup' ? selected.storeAddress : [selected.customer.street, selected.customer.apartment, selected.customer.city, selected.customer.state, selected.customer.postalCode, selected.customer.landmark].filter(Boolean).join(', ')}</p><p className="text-sm">{selected.schedule.timing === 'asap' ? 'As soon as possible' : selected.schedule.date + ' at ' + selected.schedule.time}</p><a className="text-sm text-red-700" target="_blank" rel="noreferrer" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(store.data?.store.address || '')}>Get restaurant directions ↗</a></div></div><div className="my-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4"><p className="text-sm">For cancellation or order changes, contact the restaurant.</p><a className={outline} href={'tel:' + store.data?.store.phone.replace(/[^+\d]/g, '')}>Contact Restaurant</a></div><a className={outline} href={'tel:' + store.data?.store.phone.replace(/[^+\d]/g, '')}>Call Restaurant</a><Link className={outline + ' ml-3'} href={storePath('/track-order', store.storeCode) + '&id=' + encodeURIComponent(selected.id)}>Track order</Link></>}
      {tab === 'Help' && <><h1 className="font-serif text-3xl font-bold text-red-900">Help</h1><p className="my-5">For order changes, cancellation or refund questions, contact the restaurant.</p><a className={button} href={'tel:' + store.data?.store.phone.replace(/[^+\d]/g, '')}>Call {store.data?.store.phone}</a><p className="mt-6 text-sm text-gray-500">Your orders are securely saved to your account. Contact the restaurant for order changes or payment questions.</p></>}
    </section>
  </main>;
}
