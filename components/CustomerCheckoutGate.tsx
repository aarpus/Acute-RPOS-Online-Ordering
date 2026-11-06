'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authPagePath, checkoutSession, isCheckoutPath } from '../lib/checkout-auth';
import { useStore } from './StoreProvider';
import { customerForUser } from '../lib/address';

export default function CustomerCheckoutGate({ children }: { children: ReactNode }) {
  const store = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!isCheckoutPath(pathname)) return;
    let cancelled = false;
    setVerified(false); setError('');
    checkoutSession(store.storeFetch).then(user => {
      if (cancelled) return;
      if (!user) { router.replace(authPagePath('/login',pathname,store.storeCode)); return; }
      store.setCustomer(previous => customerForUser(previous, store.customerUserId, user));
      store.setCustomerUserId(user.id);
      setVerified(true);
    }).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:'Unable to check your login. Please try again.');});
    return ()=>{cancelled=true;};
  },[pathname,store.storeCode,store.storeFetch,retry,router]);
  if (!isCheckoutPath(pathname) || verified) return <>{children}</>;
  return <main className="mx-auto max-w-lg px-5 py-16 text-center">
    {error ? <><p data-notice-tone="error" role="alert">{error}</p><button type="button" className="mt-4 rounded bg-red-700 px-5 py-3 text-white" onClick={()=>setRetry(value=>value+1)}>Try again</button></> : <p role="status">Checking your login…</p>}
  </main>;
}
