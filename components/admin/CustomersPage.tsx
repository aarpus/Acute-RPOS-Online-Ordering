'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminShell from './AdminShell';
import AdminIcon from './AdminIcon';

type Customer={id:string;storeCode:string;storeName:string;firstName:string;lastName:string;email:string;phoneNumber:string;createdAt:string;updatedAt:string};
type CustomerList={customers:Customer[];stores:{code:string;name:string}[];total:number;page:number;pageSize:number;totalPages:number};
const initial:CustomerList={customers:[],stores:[],total:0,page:1,pageSize:25,totalPages:1};
const dateLabel=(date:string)=>new Date(date).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

export default function CustomersPage() {
  const router=useRouter();
  const params=useSearchParams();
  const [data,setData]=useState<CustomerList>(initial);
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  const [store,setStore]=useState(params.get('store_code')||'');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(25);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [selected,setSelected]=useState<Customer|null>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},250);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError('');setSelected(null);
    const queryParams=new URLSearchParams({q:query,page:String(page),page_size:String(pageSize)});
    if(store)queryParams.set('store_code',store);
    fetch(`/api/admin/customers?${queryParams}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(response.status===401){router.replace('/admin/login');return;}
      const result=await response.json() as CustomerList & {error?:string};
      if(!response.ok)throw new Error(result.error||'Unable to load customers.');
      if(!controller.signal.aborted)setData(result);
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Unable to load customers.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[query,store,page,pageSize,retry,router]);
  useEffect(()=>{
    if(!selected)return;
    const previous=document.activeElement as HTMLElement|null;
    closeRef.current?.focus();
    return()=>{if(previous?.isConnected)previous.focus();};
  },[selected]);
  async function signOut(){await fetch('/api/admin/logout',{method:'POST'});router.replace('/admin/login');}
  return <AdminShell active="Customers" pageTitle="Customers" pageSubtitle="View customers registered through your restaurant websites." onSignOut={signOut}>
    <div className="p-5 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#183f70]">Registered Customers</h2><p className="mt-1 text-xs text-slate-500">{loading?'Loading registrations…':`${data.total} ${data.total===1?'customer':'customers'}${query?' matching your search':''}`} · Newest registrations first</p></div><button type="button" onClick={()=>setRetry(value=>value+1)} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#183f70] disabled:opacity-50">Refresh</button></div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><span className="sr-only">Search customers</span><AdminIcon name="user" className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={search} maxLength={200} onChange={event=>setSearch(event.target.value)} placeholder="Search name, email or phone…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm"/></label><label><span className="sr-only">Filter customers by store</span><select value={store} onChange={event=>{setStore(event.target.value);setPage(1);}} className="h-full min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:min-w-56"><option value="">All Stores</option>{data.stores.map(store=><option key={store.code} value={store.code}>{store.name} ({store.code})</option>)}</select></label></div>
      {error && <p data-notice-tone="error" role="alert" className="mb-4">{error} <button type="button" className="underline" onClick={()=>setRetry(value=>value+1)}>Retry</button></p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Registered customers" aria-busy={loading}>
        {loading?<p className="p-8 text-center text-sm text-slate-500" role="status">Loading customers…</p>:error?<p className="p-8 text-center text-sm text-slate-500">Customer details are unavailable. Please retry.</p>:!data.customers.length?<p className="p-8 text-center text-sm text-slate-500">{query?'No customers match your search.':'No registered customers found for the selected stores.'}</p>:<div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>{['#','Customer Name','Email','Phone','Registered Store','Registration Date','Action'].map(heading=><th key={heading} scope="col" className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{data.customers.map((customer,index)=><tr key={customer.id} className="border-t border-slate-100"><td className="px-4 py-4 text-slate-500">{(data.page-1)*data.pageSize+index+1}</td><td className="px-4 py-4 font-semibold text-[#183f70]">{customer.firstName} {customer.lastName}</td><td className="px-4 py-4">{customer.email}</td><td className="px-4 py-4">{customer.phoneNumber}</td><td className="px-4 py-4">{customer.storeName}<span className="mt-1 block text-[10px] text-slate-400">{customer.storeCode}</span></td><td className="px-4 py-4 whitespace-nowrap">{dateLabel(customer.createdAt)}</td><td className="px-4 py-4"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 font-semibold text-[#183f70]" aria-label={`View ${customer.firstName} ${customer.lastName} details`} onClick={()=>setSelected(customer)}>View Details</button></td></tr>)}</tbody></table></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><p>{!loading&&!error?`Showing ${data.total?(data.page-1)*data.pageSize+1:0}–${Math.min(data.page*data.pageSize,data.total)} of ${data.total}`:' '}</p><div className="flex items-center gap-3"><label>Per page <select value={pageSize} onChange={event=>{setPageSize(Number(event.target.value));setPage(1);}} className="ml-1 rounded border border-slate-200 p-1.5">{[10,25,50].map(size=><option key={size}>{size}</option>)}</select></label><button type="button" disabled={loading||!!error||data.page<=1} onClick={()=>setPage(data.page-1)} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Previous</button><span>{data.page} / {data.totalPages}</span><button type="button" disabled={loading||!!error||data.page>=data.totalPages} onClick={()=>setPage(data.page+1)} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Next</button></div></div>
      </section>
    </div>
    {selected && <><button type="button" aria-label="Close customer details overlay" className="fixed inset-0 z-30 bg-slate-950/40" onClick={()=>setSelected(null)}/><aside role="dialog" aria-modal="true" aria-labelledby="customer-details-title" className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onKeyDown={event=>{if(event.key==='Escape')setSelected(null);if(event.key==='Tab'){event.preventDefault();closeRef.current?.focus();}}}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-slate-500">Registered Customer</p><h2 id="customer-details-title" className="mt-1 text-xl font-bold text-[#183f70]">{selected.firstName} {selected.lastName}</h2></div><button type="button" ref={closeRef} aria-label="Close customer details" className="rounded px-2 py-1 text-xl text-slate-500" onClick={()=>setSelected(null)}>×</button></div><dl className="mt-6 divide-y divide-slate-100">{[['First Name',selected.firstName],['Last Name',selected.lastName],['Email',selected.email],['Phone Number',selected.phoneNumber],['Registered Store',`${selected.storeName} (${selected.storeCode})`],['Registration Date',dateLabel(selected.createdAt)],['Last Updated',dateLabel(selected.updatedAt)],['Customer ID',selected.id]].map(([label,value])=><div key={label} className="py-4"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#152033]">{value}</dd></div>)}</dl></aside></>}
  </AdminShell>;
}
