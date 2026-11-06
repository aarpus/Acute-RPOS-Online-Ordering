'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminShell from './AdminShell';
import PosIntegrationPanel from './PosIntegrationPanel';

type Store = {
  storeid: string;
  storename: string | null;
  store_code: string | null;
  storetime: string | null;
  storeaddress1: string | null;
  storeaddress2: string | null;
  storecity: string | null;
  storestate: string | null;
  storezipcode: string | null;
  storephonenumber: string | null;
  storefaxnumber: string | null;
  storeaccountnumber: string | null;
  storeroutingnumber: string | null;
  is_active: boolean;
};

type FormValues = Omit<Store, 'storeid' | 'storename'> & { storeid?: string; storename: string };
type FieldErrors = Record<string, string>;

const emptyForm: FormValues = { storename: '', store_code: '', storetime: '', storeaddress1: '', storeaddress2: '', storecity: '', storestate: '', storezipcode: '', storephonenumber: '', storefaxnumber: '', storeaccountnumber: '', storeroutingnumber: '', is_active: true };
const fields = [
  ['storename', 'Store Name', 50], ['store_code', 'Store Code', 50], ['storetime', 'Store Time', 200],
  ['storeaddress1', 'Address Line 1', 200], ['storeaddress2', 'Address Line 2', 200], ['storecity', 'City', 30],
  ['storestate', 'State', 20], ['storezipcode', 'ZIP / Postal Code', 10], ['storephonenumber', 'Phone Number', 15], ['storefaxnumber', 'Fax Number', 15],
  ['storeaccountnumber', 'Account Number', 30], ['storeroutingnumber', 'Routing Number', 30],
] as const;

function display(value: string | null | undefined) { return value ?? ''; }

export default function StoresPage({ mode = 'list' }: { mode?: 'list' | 'form' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = mode === 'form' ? searchParams.get('storeid') : null;
  const isForm = mode === 'form';
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [loading, setLoading] = useState(!isForm || Boolean(editingId));
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState(searchParams.get('saved') === '1' ? 'Store saved successfully.' : '');
  const [error, setError] = useState('');

  async function loadStores() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/stores', { cache: 'no-store' });
      const payload = await response.json() as { stores?: Store[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to load stores.');
      setStores(payload.stores || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load stores.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (!isForm) void loadStores(); }, [isForm]);

  useEffect(() => {
    if (!isForm) return;
    let cancelled = false;
    async function loadStore() {
      setNotice(''); setErrors({}); setError('');
      if (!editingId) { const next = { ...emptyForm }; setForm(next); setLoading(false); return; }
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/stores/${encodeURIComponent(editingId)}`);
        const payload = await response.json() as { store?: Store; error?: string };
        if (!response.ok || !payload.store) throw new Error(payload.error || 'Unable to load the store.');
        if (!cancelled) {
          const next = { storeid: payload.store.storeid, is_active: payload.store.is_active, ...Object.fromEntries(fields.map(([name]) => [name, display(payload.store?.[name as keyof Store] as string | null)])) } as FormValues;
          setForm(next);
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load the store.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void loadStore();
    return () => { cancelled = true; };
  }, [editingId, isForm]);

  function change(name: string, value: string | boolean) { setForm((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: '' })); setNotice(''); }
  function cancel() { router.push('/admin/stores'); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setErrors({}); setError(''); setNotice('');
    const nextErrors: FieldErrors = {};
    if (!form.storename.trim()) nextErrors.storename = 'Store Name is required.';
    if (!form.store_code?.trim()) nextErrors.store_code = 'Store Code is required.';
    for (const [name, label, max] of fields) if (String(form[name] ?? '').length > max) nextErrors[name] = `${label} must be ${max} characters or fewer.`;
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setSubmitting(false); return; }
    try {
      const response = await fetch(editingId ? `/api/admin/stores/${encodeURIComponent(editingId)}` : '/api/admin/stores', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const payload = await response.json() as { store?: Store; fields?: FieldErrors; error?: string };
      if (!response.ok) { setErrors(payload.fields || {}); throw new Error(payload.error || 'Unable to save the store.'); }
      router.replace('/admin/stores?saved=1');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the store.'); }
    finally { setSubmitting(false); }
  }

  async function signOut() { await fetch('/api/admin/logout', { method: 'POST' }); router.replace('/admin/login'); }
  return <AdminShell active="Stores" pageTitle="Stores" pageSubtitle="Manage your restaurant store details." onSignOut={signOut}>
    <div className="p-5 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-[#183f70]">{isForm ? editingId ? 'Edit Store Details' : 'Store Details' : 'Existing Stores'}</h2><p className="mt-1 text-xs text-slate-500">{isForm ? 'Enter the operational details used for this store.' : 'View and manage your saved stores.'}</p></div><button type="button" onClick={() => router.push(isForm ? '/admin/stores' : '/admin/stores/new')} className="rounded-lg bg-[#183f70] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0d315d]">{isForm ? 'Back to Stores' : '+ Add Store'}</button></div>
      {error && <p data-notice-tone="error" role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}
      {notice && <p data-notice-tone="success" role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{notice}</p>}
      {isForm && <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <Section title="Store Information"><div className="grid gap-4 md:grid-cols-2">{fields.slice(0, 3).map(([name, label, max]) => <Field key={name} name={name} label={label} max={max} value={String(form[name] ?? '')} error={errors[name]} onChange={change} />)}<label className="flex items-center gap-3 self-end pb-2 text-xs font-bold text-[#183f70]"><input type="checkbox" checked={form.is_active} onChange={(event) => change('is_active', event.target.checked)} className="h-4 w-4 accent-[#183f70]" />Active</label></div></Section>
        <Section title="Address"><div className="grid gap-4 md:grid-cols-2">{fields.slice(3, 8).map(([name, label, max]) => <Field key={name} name={name} label={label} max={max} value={String(form[name] ?? '')} error={errors[name]} onChange={change} />)}</div></Section>
        <Section title="Contact"><div className="grid gap-4 md:grid-cols-2">{fields.slice(8, 10).map(([name, label, max]) => <Field key={name} name={name} label={label} max={max} value={String(form[name] ?? '')} error={errors[name]} inputMode="tel" onChange={change} />)}</div></Section>
        <Section title="Bank Details"><div className="grid gap-4 md:grid-cols-2">{fields.slice(10).map(([name, label, max]) => <Field key={name} name={name} label={label} max={max} value={String(form[name] ?? '')} error={errors[name]} onChange={change} />)}</div></Section>
        <div className="mt-7 flex flex-col-reverse justify-end gap-3 border-t border-slate-100 pt-5 sm:flex-row"><button type="button" onClick={cancel} className="rounded-lg border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={submitting || loading} className="rounded-lg bg-[#183f70] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0d315d] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Save Store'}</button></div>
      </form>}
      {isForm && editingId && !loading && form.storeid === editingId && <PosIntegrationPanel key={editingId} storeId={editingId} />}
      {!isForm && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-[#183f70]">Existing Stores</h2></div>{loading ? <p className="p-5 text-xs text-slate-500">Loading stores…</p> : stores.length === 0 ? <p className="p-5 text-xs text-slate-500">No stores have been added yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Store Name</th><th className="px-5 py-3">Store Code</th><th className="px-5 py-3">City</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{stores.map((store) => <tr key={store.storeid} className="border-t border-slate-100"><td className="px-5 py-3 font-bold text-[#183f70]">{store.storename}</td><td className="px-5 py-3 text-slate-500">{display(store.store_code) || '—'}</td><td className="px-5 py-3 text-slate-500">{display(store.storecity) || '—'}</td><td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${store.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{store.is_active ? 'Active' : 'Inactive'}</span></td><td className="px-5 py-3 text-right"><a href={`/admin/branding?store_code=${encodeURIComponent(store.store_code || '')}`} className="mr-2 rounded border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-[#183f70]">Branding</a><button type="button" onClick={() => router.push(`/admin/stores/edit?storeid=${encodeURIComponent(store.storeid)}`)} className="rounded border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-[#183f70] hover:bg-blue-50">Edit</button></td></tr>)}</tbody></table></div>}</section>}
    </div>
  </AdminShell>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-b border-slate-100 py-5 first:pt-0 last:border-0"><h3 className="mb-4 text-sm font-black text-[#183f70]">{title}</h3>{children}</section>; }
function Field({ name, label, max, value, error, inputMode, onChange }: { name: string; label: string; max: number; value: string; error?: string; inputMode?: 'tel'; onChange: (name: string, value: string) => void }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input name={name} value={value} maxLength={max} inputMode={inputMode} onChange={(event) => onChange(name, event.target.value)} className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[#152033] outline-none focus:border-[#183f70] focus:ring-2 focus:ring-blue-50 ${error ? 'border-red-400' : 'border-slate-200'}`} />{error && <span className="mt-1 block text-[11px] font-semibold text-red-600">{error}</span>}</label>; }
