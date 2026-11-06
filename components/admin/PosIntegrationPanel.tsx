'use client';
import { useEffect, useRef, useState } from 'react';
import { menuCreateSections } from '../../lib/menu-create-policy';

type Config = { configured: boolean; menuCreateVisibility: Record<string, boolean>; canManageMenuCreation: boolean; heroUrl: string; categoriesUrl: string; taxRulesUrl: string; modifierGroupsUrl: string; itemsUrl: string; comboItemsUrl: string; variantsUrl: string; modifierOptionsUrl: string; modifierLinksUrl: string; comboGroupsUrl: string; comboOptionsUrl: string; imagesUrl: string; offersUrl: string; token?: string };
export default function PosIntegrationPanel({ storeId }: { storeId: string }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [token, setToken] = useState('');
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<'POST' | 'DELETE' | null>(null);
  const confirmationRef = useRef<HTMLDialogElement>(null);
  const endpoint = `/api/admin/stores/${encodeURIComponent(storeId)}/pos-credential`;
  useEffect(() => {
    if (pendingAction) confirmationRef.current?.showModal();
    else confirmationRef.current?.close();
  }, [pendingAction]);
  useEffect(() => {
    const controller = new AbortController(); setPendingAction(null); setToken(''); setConfig(null); setError(''); setOrigin(window.location.origin);
    fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json() as { data: Config; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to load POS settings.');
      if (!controller.signal.aborted) setConfig(result.data);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [endpoint]);
  async function changeToken(method: 'POST' | 'DELETE') {
    if (busy || !config) return;
    setPendingAction(null);
    setBusy(true); setError(''); setToken('');
    try {
      const response = await fetch(endpoint, { method, cache: 'no-store' });
      const result = await response.json() as { data: Config; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to update POS token.');
      setConfig(result.data); setToken(result.data.token || '');
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function changeVisibility(resource: string, show: boolean) {
    if (busy || !config) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menuCreateVisibility: { ...config.menuCreateVisibility, [resource]: show } }) });
      const result = await response.json() as { data: Config; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to save menu creation settings.');
      setConfig(result.data);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h3 className="text-sm font-bold text-[#183f70]">POS API Integration</h3>
    <p className="mt-2 text-xs text-slate-500">Use this store’s URLs with Authorization: Bearer &lt;token&gt;.</p>
    {config && <><div className="mt-4 space-y-3">{[['Hero Banner API', config.heroUrl], ['Categories API', config.categoriesUrl], ['Tax Rules API', config.taxRulesUrl], ['Modifier Groups API', config.modifierGroupsUrl], ['Items API', config.itemsUrl], ['Combo Items API', config.comboItemsUrl], ['Variants API', config.variantsUrl], ['Modifier Options API', config.modifierOptionsUrl], ['Modifier Links API', config.modifierLinksUrl], ['Combo Groups API', config.comboGroupsUrl], ['Combo Options API', config.comboOptionsUrl], ['Images API', config.imagesUrl], ['Offers API', config.offersUrl]].map(([label, path]) => <label key={label} className="block text-xs font-bold text-slate-600">{label}<input readOnly value={origin + path} onFocus={event => event.currentTarget.select()} className="mt-1 w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs font-normal" /></label>)}</div>
      <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-200 p-3">
        <div><p className="text-xs font-bold text-[#183f70]">POS API</p><p className={`mt-1 text-[11px] font-semibold ${config.configured ? 'text-emerald-700' : 'text-slate-500'}`}>{config.configured ? 'ON · POS requests enabled' : 'OFF · POS requests disabled'}</p></div>
        <button type="button" role="switch" aria-checked={config.configured} aria-label={config.configured ? 'Disable POS API' : 'Enable POS API'} disabled={busy} onClick={() => setPendingAction(config.configured ? 'DELETE' : 'POST')} className={`relative h-7 w-12 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${config.configured ? 'bg-emerald-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${config.configured ? 'left-6' : 'left-1'}`} /></button>
      </div>
      {config.configured && <button type="button" disabled={busy} onClick={() => setPendingAction('POST')} className="mt-3 rounded border border-[#183f70] px-4 py-2 text-xs font-bold text-[#183f70] disabled:opacity-50">{busy ? 'Updating...' : 'Regenerate Token'}</button>}</>}
    {config?.canManageMenuCreation && <div className="mt-5 rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-bold text-[#183f70]">Super Admin · Menu Creation</h4>
      <p className="mt-2 text-xs text-slate-500">Choose which menu sections and editor tabs appear while POS API is enabled. Hidden sections are invisible to both Admin and Super Admin, including through direct links. Changes save automatically.</p>
      {!config.configured && <p className="mt-2 text-xs text-slate-500">Enable POS API to change these settings. All creation screens are available while POS API is off.</p>}
      <div className="mt-3 divide-y divide-slate-100">{Object.entries(menuCreateSections).map(([resource, label]) => <fieldset key={resource} disabled={busy || !config.configured} className="flex flex-wrap items-center justify-between gap-3 py-3 disabled:opacity-50">
        <legend className="float-left mr-4 text-xs font-bold text-[#183f70]">{label}</legend>
        <div className="flex gap-4">{[true, false].map(show => <label key={String(show)} className="flex items-center gap-2 text-xs text-slate-600"><input type="radio" name={`menu-create-${resource}`} checked={(config.menuCreateVisibility[resource] !== false) === show} onChange={() => void changeVisibility(resource, show)} />{show ? 'Show' : 'Hide'}</label>)}</div>
      </fieldset>)}</div>
    </div>}
    {token && <label className="mt-4 block text-xs font-bold text-[#183f70]">Copy this token now. It is shown only once.<input aria-label="New POS token" readOnly value={token} autoComplete="off" onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded border border-emerald-200 bg-emerald-50 p-3 font-mono text-xs" /></label>}
    {error && <p data-notice-tone="error" role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
    <dialog ref={confirmationRef} aria-labelledby="pos-confirm-title" aria-describedby="pos-confirm-description" onCancel={() => setPendingAction(null)} onClose={() => setPendingAction(null)} className="fixed inset-0 m-auto w-[calc(100%_-_40px)] max-w-[440px] rounded-[10px] border-0 bg-white p-[25px] text-[#152033] shadow-xl backdrop:bg-[#041a46a6]">
      <h2 id="pos-confirm-title" className="text-lg font-bold text-[#183f70]">{pendingAction === 'DELETE' ? 'Disable POS API?' : config?.configured ? 'Regenerate POS token?' : 'Enable POS API?'}</h2>
      <p id="pos-confirm-description" className="mb-[25px] mt-[15px] text-sm text-slate-600">{pendingAction === 'DELETE' ? 'Incoming POS requests for this store will be rejected until you enable the API again.' : config?.configured ? 'The current token will stop working. Copy the new token into your POS settings to continue sending requests.' : 'A new token will be generated. Copy it into your POS settings to enable requests for this store.'}</p>
      <div className="flex justify-end gap-2.5">
        <button type="button" autoFocus onClick={() => setPendingAction(null)} className="rounded-md border border-slate-200 px-4 py-2 text-xs font-bold text-[#183f70] hover:bg-slate-50">Cancel</button>
        <button type="button" disabled={busy || !pendingAction} onClick={() => { if (pendingAction) void changeToken(pendingAction); }} className={`rounded-md px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${pendingAction === 'DELETE' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#183f70] hover:bg-[#0d315d]'}`}>{pendingAction === 'DELETE' ? 'Disable POS API' : config?.configured ? 'Regenerate Token' : 'Enable POS API'}</button>
      </div>
    </dialog>
  </section>;
}
