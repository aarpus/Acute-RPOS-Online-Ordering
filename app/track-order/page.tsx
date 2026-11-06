'use client';

import Link from 'next/link';
import { useSavedOrder } from '../../components/useSavedOrder';
import { orderStatusLabel } from '../../lib/order';
import { storePath } from '../../lib/checkout-auth';
import { useStore } from '../../components/StoreProvider';
import OrderDetails from '../../components/OrderDetails';
import MapPreview from '../../components/MapPreview';

export default function TrackingPage() {
  const { data, storeCode } = useStore();
  const { order, loading, error } = useSavedOrder(true);
  if (!data) return null;
  if (!order) return <main className="px-5 py-20 text-center"><h1 className="font-serif text-2xl">{loading ? 'Loading order...' : error || 'No order selected'}</h1><Link href="/" className="mt-4 inline-block text-red-700 underline">Go to Menu →</Link></main>;
  const pickup = order.mode === 'Pickup';
  const step = order.status === 'cancelled' ? -1 : order.status === 'completed' ? 3 : order.status === 'out_for_delivery' || pickup && order.status === 'ready' ? 2 : ['accepted', 'preparing', 'ready'].includes(order.status) ? 1 : 0;
  const stages = pickup ? ['Order Placed', 'Accepted & Preparing', 'Ready for Pickup', 'Collected'] : ['Order Placed', 'Accepted & Preparing', 'Out for Delivery', 'Delivered'];
  const descriptions = ['Your order has been placed. Waiting for restaurant acceptance.', 'Your food is being freshly prepared.', pickup ? 'Your food is packed and ready to collect.' : 'Your order is out for delivery.', pickup ? 'Your order has been collected. Enjoy your meal!' : 'Your order has been delivered. Enjoy your meal!'];
  const address = pickup ? order.storeAddress : [order.customer.street, order.customer.apartment, order.customer.city, order.customer.state, order.customer.postalCode, order.customer.landmark].filter(Boolean).join(', ');
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-center font-serif text-3xl font-bold text-red-800">Track Your Order</h1><p className="mt-2 text-center text-sm font-semibold">Order #{order.orderNumber}</p>
      <ol className="my-8 grid grid-cols-4 gap-2">{stages.map((stage, index) => <li key={stage} aria-current={index === step ? 'step' : undefined} className={`relative border-t-2 pt-5 text-center ${index <= step ? 'border-red-700 text-red-700' : 'border-gray-200 text-gray-400'}`}><span className={`absolute top-0 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-content-center rounded-full text-white ${index <= step ? 'bg-red-700' : 'bg-gray-300'}`}>{index <= step ? '✓' : index + 1}</span><strong className="text-xs sm:text-sm">{stage}</strong>{index === 0 && <p className="mt-1 text-xs text-gray-500">{new Date(order.createdAt).toLocaleTimeString(data.store.locale, { hour: 'numeric', minute: '2-digit' })}</p>}</li>)}</ol>
      <div data-notice-tone="warning" className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 p-5"><div><p className="text-sm text-gray-500">{order.status === 'cancelled' ? 'Order cancelled' : step === 3 ? 'Order complete' : pickup ? 'Estimated ready time' : 'Estimated arrival'}</p><strong className="text-xl text-red-700">{order.status === 'cancelled' ? 'No payment due' : step === 3 ? 'Enjoy your meal!' : order.schedule.timing === 'later' ? `${order.schedule.date} · ${order.schedule.time}` : pickup ? data.ordering.readyMinutes : data.ordering.deliveryMinutes}</strong><p className="mt-1 text-sm text-gray-600" role="status">{order.status === 'cancelled' ? 'This order has been cancelled.' : order.status === 'ready' && !pickup ? 'Your order is packed and ready for dispatch.' : descriptions[step]}</p></div><a href={`tel:${data.store.phone.replace(/[^+\d]/g, '')}`} className="rounded border border-red-700 px-4 py-2 text-sm font-semibold text-red-700">☎ Contact Restaurant</a></div>
      <div data-notice-tone="warning" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-4"><p className="text-sm text-amber-900">{orderStatusLabel[order.status]} | Payment {order.status === 'cancelled' ? 'not due' : order.paymentStatus === 'paid' ? 'received' : 'pending'}. Status refreshes automatically.</p></div>
      <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]"><section className="rounded-lg border border-gray-200 p-5"><h2 className="mb-3 font-semibold text-red-700">{pickup ? 'Pickup Location' : 'Delivery Address'}</h2><p className="font-semibold">{order.customer.name}</p><p className="mb-4 text-sm text-gray-500">{order.customer.phone}</p><MapPreview address={address} /></section><OrderDetails order={order} /></div>
      <div className="mt-6 flex justify-center gap-5 text-sm text-red-700 underline"><Link href={storePath('/order-confirmed', storeCode) + '&id=' + encodeURIComponent(order.id)}>View confirmation</Link><Link href="/">Back to Menu</Link></div>
    </main>
  );
}
