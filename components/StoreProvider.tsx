'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { getStorefront } from '../lib/storefront';
import { emptyCustomer, emptySchedule, type CartItem, type Customer, type SavedOrder, type Schedule } from '../lib/order';
import Header from './Header';
import Footer from './Footer';
import { applyWebsitePreview, type WebsitePreviewDraft } from '../lib/website-preview';
import { defaultBrandSettings } from '../lib/branding-defaults';
import CustomerCheckoutGate from './CustomerCheckoutGate';

type StorefrontData = Awaited<ReturnType<typeof getStorefront>>;

function useStoreState(initialData: StorefrontData) {
  const [data, setData] = useState(initialData);
  useEffect(() => setData(initialData), [initialData]);
  const storeCode = data.store.code;
  const storageKey = (key: string) => `${key}:${encodeURIComponent(storeCode)}`;
  const storeFetch = useCallback((url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('x-store-code', storeCode);
    return fetch(url, { ...init, headers, cache: 'no-store' });
  }, [storeCode]);
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mode, setMode] = useState('Delivery');
  // The parent already fetched the initial Delivery catalog. Fetch again only
  // when the order mode needs different availability/pricing.
  const loadedCatalog = useRef({ initialData, mode: 'Delivery' });
  useEffect(() => {
    if (loadedCatalog.current.initialData !== initialData) loadedCatalog.current = { initialData, mode: 'Delivery' };
    if (loadedCatalog.current.mode === mode) return;
    const controller = new AbortController();
    fetch('/api/home', { cache: 'no-store', signal: controller.signal, headers: { 'x-store-code': storeCode, 'x-order-mode': mode } }).then(async response => { if (response.ok) { const fresh = await response.json() as StorefrontData; if (!controller.signal.aborted) { loadedCatalog.current = { initialData, mode }; setData(fresh); } } }).catch(() => {});
    return () => controller.abort();
  }, [mode, initialData, storeCode]);
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule);
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [customerUserId, setCustomerUserId] = useState('');
  const [promo, setPromo] = useState('');
  const [order, setOrder] = useState<SavedOrder | null>(null);

  // Keep the cart and checkout in this browser tab, including page refreshes.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey('spice-ordering-v2')) || 'null');
      if (saved && Array.isArray(saved.cart) && saved.cart.every((item: CartItem) =>
        item.product?.id && Array.isArray(item.product.sizes) && Array.isArray(item.product.extras)
        && Array.isArray(item.extraIds) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99)) {
        setCart(saved.cart);
        setMode(saved.mode === 'Pickup' ? 'Pickup' : 'Delivery');
        if (saved.schedule && ['asap', 'later'].includes(saved.schedule.timing) && typeof saved.schedule.date === 'string' && typeof saved.schedule.time === 'string') setSchedule(saved.schedule);
        if (saved.customer) setCustomer({ ...emptyCustomer, ...saved.customer });
        if (typeof saved.customerUserId === 'string') setCustomerUserId(saved.customerUserId);
        setPromo('');
      }
    } catch { /* An unavailable browser storage does not stop ordering. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(storageKey('spice-ordering-v2'), JSON.stringify({ cart, mode, schedule, customer, customerUserId, promo })); } catch {}
  }, [ready, cart, mode, schedule, customer, customerUserId, promo, order]);

  // Only remember an identifier; saved orders are always reloaded with authorization.
  useEffect(() => {
    if (!ready || !order) return;
    try {
      sessionStorage.setItem(storageKey('last-order-id'), order.id);
    } catch { /* Ordering remains available when storage is disabled. */ }
  }, [ready, order]);

  const formatPrice = (amount: number) => new Intl.NumberFormat(data?.store.locale || 'en-US', {
    style: 'currency', currency: data?.store.currency || 'USD',
  }).format(amount);

  function addItem(item: CartItem) {
    setCart((items) => {
      const old = items.find((entry) => entry.id === item.id);
      return old ? items.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.min(item.product.maximumQuantity ?? 99, entry.quantity + item.quantity) } : entry) : [...items, item];
    });
  }
  function changeQuantity(id: string, change: number) {
    setCart((items) => items.map((item) => item.id === id ? { ...item, quantity: item.quantity + change <= 0 ? 0 : Math.max(item.product.minimumQuantity ?? 1, Math.min(item.product.maximumQuantity ?? 99, item.quantity + change)) } : item).filter((item) => item.quantity > 0));
  }
  return { data, storeCode, storeFetch, storageKey, ready, cart, setCart, mode, setMode, schedule, setSchedule,
    customer, setCustomer, customerUserId, setCustomerUserId, promo, setPromo, order, setOrder, formatPrice, addItem, changeQuantity };

}

const StoreContext = createContext<ReturnType<typeof useStoreState> | null>(null);
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Use StoreProvider around your pages');
  return store;
}

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [data, setData] = useState<StorefrontData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<WebsitePreviewDraft | null>(null);
  const [preview, setPreview] = useState(false);
  const isAdmin = pathname.startsWith('/admin');
  useEffect(() => {
    if (isAdmin) return;
    const query = new URLSearchParams(window.location.search);
    const code = query.get('store_code');
    if (!code) return;
    setSelectedCode(code);
    if (query.get('website-preview') !== '1' || window.parent === window) return;
    setPreview(true);
    function onDraft(event: MessageEvent<WebsitePreviewDraft>) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const draft = event.data;
      if (draft?.type !== 'website-preview:update' || draft.storeCode !== code || !draft.settings || !Array.isArray(draft.categories)) return;
      setPreviewDraft(draft);
    }
    window.addEventListener('message', onDraft);
    window.parent.postMessage({ type: 'website-preview:ready' }, window.location.origin);
    return () => window.removeEventListener('message', onDraft);
  }, [isAdmin]);
  useEffect(() => {
    if (isAdmin) return;
    const controller = new AbortController();
    setSwitching(true); setError('');
    (async () => {
      try {
        const response = await fetch('/api/home', { signal: controller.signal, cache: 'no-store', headers: selectedCode ? { 'x-store-code': selectedCode } : {} });
        if (!response.ok) {
          const failure = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(failure?.error || 'Unable to load stores. Please try again or contact the restaurant.');
        }
        const home = await response.json() as StorefrontData;
        if (controller.signal.aborted) return;
        setData(home);

        setSwitching(false);
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Unable to load store.'); setSwitching(false); }
      }
    })();
    return () => controller.abort();
  }, [isAdmin, selectedCode, retry]);
  if (isAdmin) return <>{children}</>;
  if (error || !data || switching) return <main className="grid min-h-screen place-content-center px-5"><div data-notice-tone={error ? 'error' : 'info'} role={error ? 'alert' : 'status'} className="grid max-w-md gap-4 rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm"><p>{error || 'Loading store...'}</p>{error && <button onClick={() => { setSelectedCode(null); setRetry(value => value + 1); }} className="rounded bg-red-700 px-5 py-2 text-white">Try again</button>}</div></main>;
  return <SelectedStoreProvider key={data.store.code} data={applyWebsitePreview(data, previewDraft)} preview={preview} onStoreChange={setSelectedCode}>{children}</SelectedStoreProvider>;
}

function SelectedStoreProvider({ children, data, preview, onStoreChange }: { children: React.ReactNode; data: StorefrontData; preview: boolean; onStoreChange: (code: string) => void }) {
  const store = useStoreState(data);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    const seo = data.seo.find(row => row.targetType === 'page' && row.targetId === pathname);
    document.title = seo?.title || `${data.store.name} | Online Ordering`;
    const created: HTMLElement[] = [];
    for (const [name, content] of [['description', seo?.description], ['keywords', seo?.keywords], ['og:title', seo?.title], ['og:description', seo?.description], ['og:image', seo?.imageUrl]]) {
      if (!content) continue;
      const meta = document.createElement('meta'); meta.setAttribute(name!.startsWith('og:') ? 'property' : 'name', name!); meta.content = content; document.head.appendChild(meta); created.push(meta);
    }
    if (seo?.canonicalUrl) { const link = document.createElement('link'); link.rel = 'canonical'; link.href = seo.canonicalUrl; document.head.appendChild(link); created.push(link); }
    return () => created.forEach(node => node.remove());
  }, [data.store.name, data.seo, pathname]);
  const branding = data.branding ?? defaultBrandSettings;
  if (!store.ready) return <main className="grid min-h-screen place-content-center">Loading store...</main>;
  return <StoreContext.Provider value={store}><div className="storefront-theme" inert={preview} style={{ '--brand-primary': branding.primaryColor, '--brand-header': branding.headerColor, '--brand-footer': branding.footerColor, '--brand-footer-text': branding.footerTextColor, '--brand-accent': branding.accentColor } as React.CSSProperties}>
    <Header store={data.store} links={data.header.links} navAlignment={branding.navAlignment} locations={data.stores} location={store.storeCode} onLocationChange={(code) => { if (code !== store.storeCode) onStoreChange(code); }} cartCount={store.cart.reduce((sum, item) => sum + item.quantity, 0)} onCartClick={() => router.push('/cart')} />
    <div key={store.storeCode} className="min-h-[65vh]"><CustomerCheckoutGate key={pathname}>{children}</CustomerCheckoutGate></div>
    <Footer store={data.store} footer={data.footer} />
  </div></StoreContext.Provider>;
}

export function EmptyCart() {
  return <main className="mx-auto max-w-3xl px-5 py-20 text-center"><h1 className="font-serif text-3xl font-bold">Your cart is empty</h1><p className="my-5 text-gray-600">Choose your favourites before continuing.</p><Link href="/" className="inline-block rounded bg-red-700 px-6 py-3 text-white">Explore Menu →</Link></main>;
}
