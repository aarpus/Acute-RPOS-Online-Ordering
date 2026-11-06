'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../components/admin/AdminShell';
import AdminIcon from '../../../components/admin/AdminIcon';
import StatusBadge from '../../../components/admin/StatusBadge';
import Pagination from '../../../components/admin/Pagination';
import OrderDetailsPanel from '../../../components/admin/OrderDetailsPanel';
import { orderStatusLabel, type SavedOrder } from '../../../lib/order';

export default function OrdersPage() {
  const router = useRouter();
  const [query, setQuery] = useState(''), [mode, setMode] = useState(''), [payment, setPayment] = useState(''), [status, setStatus] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [stores, setStores] = useState<{ code: string; name: string }[]>([]);
  const [orders, setOrders] = useState<SavedOrder[]>([]), [selected, setSelected] = useState<SavedOrder | null>(null);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ q: query, mode, payment, status, page: String(page) });
        if (storeCode) params.set('store_code', storeCode);
        const response = await fetch('/api/admin/orders?' + params, { cache: 'no-store', signal: controller.signal });
        if (response.status === 401) { router.replace('/admin/login'); return; }
        const result = await response.json() as { orders: SavedOrder[]; total: number; stores: { code: string; name: string }[]; error?: string };
        if (!response.ok) throw Error(result.error || 'Unable to load orders.');
        if (!controller.signal.aborted) { setOrders(result.orders); setTotal(result.total); setStores(result.stores); setError(''); }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load orders.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    setLoading(true);
    const delay = window.setTimeout(() => void load(), 200);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15000);
    return () => { controller.abort(); window.clearTimeout(delay); window.clearInterval(interval); };
  }, [query, mode, payment, status, storeCode, page, refresh, router]);
  async function selectOrder(id: string) {
    try {
      const response = await fetch('/api/admin/orders/' + id, { cache: 'no-store' });
      const result = await response.json() as SavedOrder & { error?: string };
      if (!response.ok) throw Error(result.error || 'Unable to load order.');
      setSelected(result);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load order.'); }
  }
  async function signOut() { await fetch('/api/admin/logout', { method: 'POST' }); router.replace('/admin/login'); }
  const selectClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs';
  return <AdminShell active="Orders & Payments" pageTitle="Order Support & Payment Status" pageSubtitle="Search and view orders for your store." onSignOut={signOut}>
    <div className="p-5 sm:p-8">
      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="relative flex-1"><AdminIcon name="link" className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Search orders" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search by order ID or customer name…" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-[#183f70]" /></div>
        <div className="flex flex-wrap gap-2">
          {stores.length > 1 && <select aria-label="Store" value={storeCode} onChange={event => { setStoreCode(event.target.value); setPage(1); }} className={selectClass}><option value="">All Stores</option>{stores.map(store => <option key={store.code} value={store.code}>{store.name}</option>)}</select>}
          <select aria-label="Order type" value={mode} onChange={e => { setMode(e.target.value); setPage(1); }} className={selectClass}><option value="">All Types</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select>
          <select aria-label="Payment status" value={payment} onChange={e => { setPayment(e.target.value); setPage(1); }} className={selectClass}><option value="">All Payment Status</option><option value="paid">Paid</option><option value="pending">Pending</option></select>
          <select aria-label="Order status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={selectClass}><option value="">All Order Status</option>{Object.entries(orderStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr>{['Order ID', 'Store', 'Amount', 'Payment', 'Order Type', 'Fulfillment', 'Date & Time'].map(h => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
          <tbody>{!orders.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">{loading ? 'Loading orders…' : 'No orders found.'}</td></tr>}{orders.map(order => <tr key={order.id} onClick={() => void selectOrder(order.id)} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/40">
            <td className="px-3 py-3 font-bold text-[#183f70]"><button onClick={e => { e.stopPropagation(); void selectOrder(order.id); }} className="text-left">{order.orderNumber}</button></td><td className="px-3 py-3">{order.storeName}</td>
            <td className="px-3 py-3 font-bold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency }).format(order.totals.total)}</td>
            <td className="px-3 py-3"><StatusBadge tone={order.paymentStatus === 'paid' ? 'success' : 'warning'}>{order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</StatusBadge></td>
            <td className="px-3 py-3"><StatusBadge>{order.mode}</StatusBadge></td><td className="px-3 py-3"><StatusBadge tone={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'neutral'}>{orderStatusLabel[order.status]}</StatusBadge></td>
            <td className="px-3 py-3 text-slate-500">{new Date(order.createdAt).toLocaleString()}</td>
          </tr>)}</tbody>
        </table>
      </div><div className="p-4"><Pagination total={Math.max(1, Math.ceil(total / 20))} page={page} onPageChange={setPage} label={loading ? 'Loading…' : 'Showing ' + orders.length + ' of ' + total + ' orders'} /></div></div>
    </div>
    {selected && <><button aria-label="Close order overlay" onClick={() => setSelected(null)} className="fixed inset-0 z-30 bg-slate-950/30" /><OrderDetailsPanel key={selected.id} order={selected} onClose={() => setSelected(null)} onUpdated={order => { setSelected(order); setRefresh(n => n + 1); }} /></>}
  </AdminShell>;
}
