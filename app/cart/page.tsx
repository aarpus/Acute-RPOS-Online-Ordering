'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authPagePath, checkoutSession, storePath } from '../../lib/checkout-auth';
import { useStore, EmptyCart } from '../../components/StoreProvider';
import OrderSummary from '../../components/OrderSummary';
import ProductCard from '../../components/ProductCard';
import ProductModal from '../../components/ProductModal';
import type { Product } from '../../data/home';
import { unitPrice } from '../../lib/order';

export default function CartPage() {
  const store = useStore();
  const { data, cart, setCart, changeQuantity, formatPrice } = store;
  const router = useRouter();
  const [checkingLogin, setCheckingLogin] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  async function proceedToCheckout() {
    if (checkingLogin) return;
    setCheckingLogin(true); setCheckoutError('');
    try {
      const user = await checkoutSession(store.storeFetch);
      router.push(user ? storePath('/pickup',store.storeCode) : authPagePath('/login','/pickup',store.storeCode));
    } catch (cause) { setCheckoutError(cause instanceof Error?cause.message:'Unable to check your login. Please try again.'); }
    finally { setCheckingLogin(false); }
  }
  if (!data) return null;
  if (!cart.length) return <EmptyCart />;

  return (
    <main className="mx-auto max-w-7xl px-5 py-7 sm:py-10">
      <div className="mb-5 flex items-center justify-between"><h1 className="font-serif text-3xl font-bold text-red-800 sm:text-4xl">Your Cart</h1><span className="text-sm">{cart.reduce((sum, item) => sum + item.quantity, 0)} items</span></div>
      <div className="grid gap-8 lg:grid-cols-[1.8fr_1fr]">
        <section>
          {cart.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-4 border-t border-gray-200 py-4 sm:flex-nowrap"><img src={item.product.image} alt={item.product.name} className="h-24 w-28 rounded-lg object-cover sm:w-36" /><div className="min-w-0 flex-1"><h2 className="font-serif text-xl font-bold">{item.product.name}</h2><p className="mt-1 text-sm text-gray-600">{item.product.sizes.find((size) => size.id === item.sizeId)?.name}{item.extraIds.map((id) => ' · ' + item.product.extras.find((extra) => extra.id === id)?.name)}</p><p className="mt-1 text-sm break-words text-gray-500">{item.instructions}</p></div><strong>{formatPrice(unitPrice(item) * item.quantity)}</strong><div className="flex items-center overflow-hidden rounded-md border border-gray-200"><button onClick={() => changeQuantity(item.id, -1)} aria-label={`Decrease ${item.product.name}`} className="px-3 py-2">−</button><span className="border-x border-gray-200 px-3 py-2">{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)} disabled={item.quantity >= 99} aria-label={`Increase ${item.product.name}`} className="px-3 py-2 disabled:opacity-30">+</button></div><button onClick={() => setCart(cart.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${item.product.name}`} className="rounded px-2 py-2 text-red-700">Remove</button></article>)}
          <div className="flex flex-wrap items-center gap-6 border-t border-gray-200 pt-5"><Link href="/" className="rounded-lg border border-red-700 px-5 py-3 font-semibold text-red-700">＋ Add more items</Link><button onClick={() => setCart([])} className="text-sm text-red-700 underline">Empty cart</button></div>
        </section>
        <OrderSummary showItems={false} showPromo><button type="button" onClick={()=>{void proceedToCheckout();}} disabled={checkingLogin} className="mt-5 block w-full rounded-lg bg-red-700 px-5 py-4 text-center font-semibold text-white hover:bg-red-800 disabled:opacity-50">{checkingLogin ? 'Checking login…' : 'Proceed to Checkout →'}</button>{checkoutError && <p data-notice-tone="error" role="alert" className="mt-3">{checkoutError}</p>}</OrderSummary>
      </div>
      <section className="mt-9"><div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-2xl font-bold">You may also like</h2><Link href="/" className="text-sm text-red-700">See All →</Link></div><div className="grid gap-4 min-[380px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">{data.products.filter((p) => !cart.some((item) => item.product.id === p.id)).slice(0, 5).map((p) => <ProductCard key={p.id} product={p} formatPrice={formatPrice} onAdd={setProduct} />)}</div></section>
      {product && <ProductModal key={product.id} product={product} onClose={() => setProduct(null)} />}
    </main>
  );
}
