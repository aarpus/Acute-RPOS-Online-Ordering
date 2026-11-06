'use client';
import { useEffect, useRef, useState } from 'react';
import { orderStatusLabel, unitPrice, type SavedOrder, type OrderStatus } from '../../lib/order';
import StatusBadge from './StatusBadge';

export default function OrderDetailsPanel({ order, onClose, onUpdated }: { order: SavedOrder; onClose: () => void; onUpdated: (order: SavedOrder) => void }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [failed, setFailed] = useState(false);
  const [code, setCode] = useState(''), [reason, setReason] = useState(''), [cancelling, setCancelling] = useState(false);
  const closed = order.status === 'completed' || order.status === 'cancelled';
  const handover = order.mode === 'Pickup' ? order.status === 'ready' : order.status === 'out_for_delivery';
  const next: Partial<Record<OrderStatus, OrderStatus>> = { placed: 'accepted', accepted: 'preparing', preparing: 'ready', ...(order.mode === 'Delivery' ? { ready: 'out_for_delivery' as const } : {}) };
  const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency }).format(value);
  async function action(action: string, extra: Record<string, string> = {}) {
    if (busy) return;
    setBusy(true); setNotice(''); setFailed(false);
    try {
      const response = await fetch('/api/admin/orders/' + order.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
      const result = await response.json() as { order: SavedOrder; error?: string; warning?: string; message?: string };
      if (!response.ok) throw Error(result.error || 'Unable to update order.');
      onUpdated(result.order); setNotice(result.warning || result.message || 'Order updated.'); setFailed(!!result.warning); setCode(''); setCancelling(false);
    } catch (error) {
      setFailed(true); setNotice(error instanceof Error ? error.message : 'Unable to update order.');
      const response = await fetch('/api/admin/orders/' + order.id, { cache: 'no-store' }).catch(() => null);
      if (response?.ok) onUpdated(await response.json() as SavedOrder);
    } finally { setBusy(false); }
  }
  const button = 'w-full rounded-lg bg-[#183f70] px-4 py-3 text-xs font-bold text-white disabled:opacity-50';
  const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs';
  return <aside ref={panel} role="dialog" aria-modal="true" aria-label="Order details" onKeyDown={event => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'Tab') {
      const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }} className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
    <div className="flex justify-between"><div><p className="text-xs font-semibold text-slate-400">Order details</p><h2 className="mt-1 text-lg font-extrabold text-[#183f70]">{order.orderNumber}</h2></div><button aria-label="Close order details" onClick={onClose} className="rounded-lg p-2 text-xl text-slate-400 hover:bg-slate-100">×</button></div>
    <div className="mt-5 flex items-center gap-3 border-b border-slate-100 pb-5"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#fff4cf] text-sm font-extrabold text-[#183f70]">{order.storeName.slice(0, 2).toUpperCase()}</div><div><p className="font-bold text-[#183f70]">{order.storeName}</p><p className="text-xs text-slate-400">{order.storeAddress}</p></div></div>
    <div className="grid grid-cols-2 gap-4 border-b border-slate-100 py-5 text-xs"><div><p className="text-slate-400">Customer</p><p className="mt-1 font-bold">{order.customer.name}</p><p className="mt-1">{order.customer.phone}</p><p className="mt-1 break-all">{order.customerEmail}</p></div><div><p className="text-slate-400">Date & Time</p><p className="mt-1 font-bold">{new Date(order.createdAt).toLocaleString()}</p><p className="mt-1">{order.schedule.timing === 'asap' ? 'ASAP' : order.schedule.date + ' ' + order.schedule.time}</p></div><div><p className="text-slate-400">Amount</p><p className="mt-1 text-base font-extrabold text-[#183f70]">{money(order.totals.total)}</p></div><div><p className="text-slate-400">Payment method</p><p className="mt-1 font-bold">{order.paymentMethod}</p></div></div>
    <div className="space-y-3 border-b border-slate-100 py-5 text-xs"><div className="flex justify-between"><span className="text-slate-500">Payment status</span><StatusBadge tone={order.paymentStatus === 'paid' ? 'success' : 'warning'}>{order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</StatusBadge></div><div className="flex justify-between"><span className="text-slate-500">Order type</span><StatusBadge>{order.mode}</StatusBadge></div><div className="flex justify-between"><span className="text-slate-500">Fulfillment</span><StatusBadge tone={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'neutral'}>{orderStatusLabel[order.status]}</StatusBadge></div>
      {order.mode === 'Delivery' && <p>{[order.customer.apartment, order.customer.street, order.customer.city, order.customer.state, order.customer.postalCode, order.customer.landmark].filter(Boolean).join(', ')}</p>}
      {order.customer.instructions && <p>{order.customer.instructions}</p>}
    </div>
    <div className="space-y-3 border-b border-slate-100 py-5 text-xs">{order.items.map(item => <div key={item.id} className="flex justify-between gap-3"><div><b>{item.quantity} × {item.product.name}</b><p className="text-slate-500">{item.product.sizes[0]?.name}{item.product.extras.map(extra => ' · ' + extra.name).join('')}</p>{item.instructions && <p>{item.instructions}</p>}</div><b>{money(unitPrice(item) * item.quantity)}</b></div>)}<div className="flex justify-between"><span>Subtotal</span><b>{money(order.totals.subtotal)}</b></div><div className="flex justify-between"><span>{order.mode} fee</span><b>{money(order.totals.fee)}</b></div></div>
    <div className="py-5"><h3 className="text-sm font-bold text-[#183f70]">Event Timeline</h3><div className="mt-4 space-y-4 border-l-2 border-[#f5b82e] pl-4 text-xs">{order.history.map(event => <p key={event.id}><b>{event.reason || orderStatusLabel[event.toStatus]}</b><span className="block text-slate-400">{new Date(event.createdAt).toLocaleString()}</span></p>)}</div></div>
    <div className="space-y-3">
      {!closed && next[order.status] && <button className={button} disabled={busy} onClick={() => void action('status', { status: next[order.status]! })}>Mark {orderStatusLabel[next[order.status]!]}</button>}
      {!closed && order.paymentStatus === 'pending' && <button className={button} disabled={busy} onClick={() => { if (window.confirm('Confirm cash payment of ' + money(order.totals.total) + ' has been received?')) void action('payment'); }}>Mark payment received</button>}
      {handover && <><p className="text-xs text-slate-500">Handover OTP is sent to the customer email. {order.otp ? 'Code ' + order.otp.status + ' · ' + order.otp.attemptsRemaining + ' attempts remaining.' : 'No code sent yet.'}</p><button className={button} disabled={busy} onClick={() => void action('send_otp')}>Send / resend email OTP</button><form onSubmit={event => { event.preventDefault(); void action('verify_otp', { code }); }} className="space-y-3"><label className="block text-xs text-slate-500">Customer OTP<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} className={input} /></label><button disabled={busy || order.paymentStatus !== 'paid'} className={button}>Verify OTP & complete order</button></form></>}
      <button disabled={busy} className={button} onClick={() => void action('confirmation')}>Resend confirmation email</button>
      {!closed && order.paymentStatus === 'pending' && <><button disabled={busy} onClick={() => setCancelling(!cancelling)} className="w-full rounded-lg border border-red-200 px-4 py-3 text-xs font-bold text-red-700">Cancel order</button>{cancelling && <form onSubmit={event => { event.preventDefault(); void action('status', { status: 'cancelled', reason }); }} className="space-y-3"><label className="block text-xs text-slate-500">Cancellation reason<textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className={input} /></label><button disabled={busy} className={button}>Confirm cancellation</button></form>}</>}
    </div>
    {notice && <p data-notice-tone={failed ? 'error' : 'success'} role="status" className={'mt-3 text-center text-xs font-bold ' + (failed ? 'text-red-700' : 'text-emerald-600')}>{notice}</p>}
  </aside>;
}
