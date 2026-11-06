'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore } from './StoreProvider';
import type { SavedOrder } from '../lib/order';

export function useSavedOrder(poll = false) {
  const { storeCode, storeFetch, ready } = useStore();
  const params = useSearchParams();
  const requestedId = params.get('id') || '';
  const [id, setId] = useState(requestedId);
  const [order, setOrder] = useState<SavedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!ready) return;
    let saved = '';
    try { saved = sessionStorage.getItem('last-order-id:' + encodeURIComponent(storeCode)) || ''; } catch {}
    setId(requestedId || saved);
    setOrder(null); setLoading(true); setError('');
  }, [ready, requestedId, storeCode]);
  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!ready) return;
    if (!id) { setLoading(false); return; }
    try {
      const response = await storeFetch('/api/orders/' + encodeURIComponent(id), { signal });
      const data = await response.json() as SavedOrder & { error?: string };
      if (!response.ok) throw Error(data.error || 'Unable to load this order.');
      if (!signal?.aborted) { setOrder(data); setError(''); }
    } catch (error) {
      if (!signal?.aborted) { setOrder(null); setError(error instanceof Error ? error.message : 'Unable to load this order.'); }
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [ready, id, storeFetch]);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    const timer = poll ? window.setInterval(() => { if (document.visibilityState === 'visible') void reload(controller.signal); }, 15000) : undefined;
    const onVisible = () => { if (poll && document.visibilityState === 'visible') void reload(controller.signal); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload, poll]);
  return { order, loading, error, reload };
}
