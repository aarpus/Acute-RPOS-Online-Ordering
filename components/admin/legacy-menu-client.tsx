'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useSearchParams } from 'next/navigation';
import { canCreateMenuRecord } from '../../lib/menu-create-policy';
import { archiveLegacy, blankLegacy, displayId, encodeLegacy, legacyRows, type LegacyRow, type MenuOperation, type MenuSnapshot } from '../../lib/menu-legacy-codec';

type Context = {
  snapshot: MenuSnapshot; storeCode: string; stores: StoreOption[]; loading: boolean; error: string; ownRevision: number; mutationView: string; mutationBaselines: Record<number, string | undefined>;
  commit: (view: string, before: LegacyRow[], after: LegacyRow[]) => Promise<boolean>; clearError: () => void;
  canCreate: (resource: string) => boolean;
};
type StoreOption = { store_code: string; storename: string | null };
const MenuContext = createContext<Context | null>(null);
export function useLegacyMenu() { const value = useContext(MenuContext); if (!value) throw new Error('Menu database context is missing.'); return value; }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { cache: 'no-store', ...init }); }
  catch (cause) { if (cause instanceof Error && cause.name === 'AbortError') throw cause; throw new Error('Cannot reach the server. Check your connection and try saving again. Your changes are still in the form.'); }
  let body: { data: T; error?: string };
  try { body = await response.json(); }
  catch { throw new Error(`The server returned an unexpected response (HTTP ${response.status}). Please retry. Your changes are still in the form.`); }
  if (!response.ok) throw new Error(body.error || 'Unable to access the menu database.');
  return body.data;
}
function resetCopyIdentity(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(resetCopyIdentity); return; }
  if (!value || typeof value !== 'object') return;
  const row = value as Record<string, unknown>;
  delete row._dbId; delete row._updatedAt;
  if ('externalId' in row) row.externalId = '';
  if ('slug' in row) row.slug = '';
  for (const child of Object.values(row)) if (child && typeof child === 'object') resetCopyIdentity(child);
}

export function OriginalMenuProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const requestedStoreCode = params.get('store_code') || '';
  const [snapshot, setSnapshot] = useState<MenuSnapshot>({});
  const [storeCode, setStoreCode] = useState(params.get('store_code') || '');
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [createPolicy, setCreatePolicy] = useState<{ posEnabled: boolean; visibility: Record<string, boolean> } | null>(null);
  const [ownRevision, setOwnRevision] = useState(0); const [mutationView, setMutationView] = useState(''); const saving = useRef(false); const generation = useRef(0);
  const [mutationBaselines, setMutationBaselines] = useState<Record<number, string | undefined>>({});
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/stores', { cache: 'no-store' }).then(async response => {
      const body = await response.json() as { stores?: StoreOption[]; error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to load stores.');
      if (cancelled) return;
      const options = (body.stores || []).filter(store => typeof store.store_code === 'string' && store.store_code.trim());
      const selected = options.find(store => store.store_code === requestedStoreCode) || options[0];
      setStores(options);
      setStoreCode(selected?.store_code || '');
      setStoresLoaded(true);
      if (!selected) { setError('Create a store before adding its menu.'); setLoading(false); }
    }).catch(cause => {
      if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Unable to load stores.'); setStoresLoaded(true); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [requestedStoreCode]);
  useEffect(() => {
    if (!storesLoaded || !storeCode) return;
    const controller = new AbortController();
    const load = async (initial = false) => {
      if (saving.current) return;
      if (initial) setLoading(true);
      const currentGeneration = generation.current;
      try { const [data, policy] = await Promise.all([request<MenuSnapshot>(`/api/admin/menu/workspace?store_code=${encodeURIComponent(storeCode)}`, { signal: controller.signal }), request<{ posEnabled: boolean; visibility: Record<string, boolean> }>(`/api/admin/menu/create-policy?store_code=${encodeURIComponent(storeCode)}`, { signal: controller.signal })]); if (!controller.signal.aborted && !saving.current && currentGeneration === generation.current) { setSnapshot(data); setCreatePolicy(policy); setError(''); } }
      catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load the menu.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load(true); const focus = () => { void load(); }; window.addEventListener('focus', focus);
    return () => { controller.abort(); window.removeEventListener('focus', focus); };
  }, [storeCode, storesLoaded]);

  async function persistImages(value: unknown, cache = new Map<string, Promise<string>>()): Promise<unknown> {
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      if (!cache.has(value)) cache.set(value, (async () => { const response = await fetch(value); const blob = await response.blob(); return (await request<{ url: string }>(`/api/admin/menu/upload?store_code=${encodeURIComponent(storeCode)}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })).url; })());
      return cache.get(value)!;
    }
    if (Array.isArray(value)) return Promise.all(value.map(child => persistImages(child, cache)));
    if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await persistImages(child, cache)])));
    return value;
  }
  async function commit(view: string, before: LegacyRow[], after: LegacyRow[]) {
    if (saving.current || !storeCode || loading) return false;
    saving.current = true; generation.current += 1; setBusy(true); setError('');
    try {
      const removed = before.filter(row => !after.some(next => next.id === row.id));
      const changed = after.filter(row => { const old = before.find(old => old.id === row.id); return !old || JSON.stringify(old) !== JSON.stringify(row); });
      const baselines = changed.map(row => ({ row, version: before.find(old => old.id === row.id)?._updatedAt as string | undefined }));
      if (!removed.length && !changed.length) return true;
      const operations: MenuOperation[] = removed.flatMap(row => archiveLegacy(view, row, snapshot));
      const imageCache = new Map<string, Promise<string>>();
      for (const candidate of changed) {
        const copy = structuredClone(candidate);
        if (!before.some(old => old.id === copy.id) && copy._dbId) resetCopyIdentity(copy);
        operations.push(...encodeLegacy(snapshot, view, await persistImages(copy, imageCache) as LegacyRow));
      }
      const result = await request<{ snapshot: MenuSnapshot; created: Record<string, string> }>(`/api/admin/menu/batch?store_code=${encodeURIComponent(storeCode)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operations }) });
      const refreshed = legacyRows(result.snapshot, view);
      for (const candidate of changed) {
        const createdId = result.created[`row:${candidate.id}`];
        const saved = refreshed.find(row => view === 'pricing' ? row.id === candidate.id : view === 'schedules' ? row._groupId === candidate._groupId || row._members?.some((member: { id: string }) => member.id === createdId) : row._dbId === createdId || row.id === candidate.id);
        if (saved) Object.assign(candidate, saved);
      }
      setSnapshot(result.snapshot); setMutationView(view); setMutationBaselines(Object.fromEntries(baselines.map(({ row, version }) => [row.id, version]))); setOwnRevision(value => value + 1);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save menu changes.'); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  return <MenuContext.Provider value={{ snapshot, storeCode, stores, loading, error, ownRevision, mutationView, mutationBaselines, commit, canCreate: resource => !!createPolicy && canCreateMenuRecord(createPolicy.posEnabled, createPolicy.visibility, resource), clearError: () => setError('') }}><div style={{ display: 'contents' }} inert={busy || loading}>{children}</div></MenuContext.Provider>;
}

export function useLegacyCollection<T extends { id: number }>(view: string): [T[], (update: SetStateAction<T[]>) => Promise<boolean>] {
  const context = useLegacyMenu();
  const rows = useMemo(() => legacyRows(context.snapshot, view) as unknown as T[], [context.snapshot, view]);
  const setRows = (update: SetStateAction<T[]>) => context.commit(view, rows as unknown as LegacyRow[], (typeof update === 'function' ? update(rows) : update) as unknown as LegacyRow[]);
  return [rows, setRows];
}
export function useLegacyDraft<T extends { id: number }>(view: string, template: T): [T, Dispatch<SetStateAction<T>>] {
  const context = useLegacyMenu();
  const [draft, setDraftState] = useState<T>(() => blankLegacy(view, template as unknown as LegacyRow, context.snapshot) as unknown as T);
  const dirty = useRef(false);
  const setDraft: Dispatch<SetStateAction<T>> = action => { dirty.current = typeof action === 'function' || !(action as unknown as LegacyRow)._dbId; setDraftState(action); };
  const initialized = useRef(false); const lastOwn = useRef(0);
  useEffect(() => {
    if (context.loading) return;
    const rows = legacyRows(context.snapshot, view);
    if (!initialized.current) { setDraftState((rows[0] || blankLegacy(view, template as unknown as LegacyRow, context.snapshot)) as unknown as T); initialized.current = true; dirty.current = false; }
    if (context.ownRevision !== lastOwn.current) {
      setDraftState(previous => {
        const saved = rows.find(row => row.id === previous.id);
        if (!saved) return previous;
        if (!dirty.current) return saved as unknown as T;
        // A different screen must never advance the baseline under an unsaved
        // draft. Its old version will correctly trigger a conflict on Save.
        return context.mutationView === view && Object.hasOwn(context.mutationBaselines, previous.id) && (previous as unknown as LegacyRow)._updatedAt === context.mutationBaselines[previous.id] ? { ...previous, ...Object.fromEntries(Object.entries(saved).filter(([key]) => key.startsWith('_'))) } : previous;
      });
      lastOwn.current = context.ownRevision;
    } else if (!dirty.current) setDraftState(previous => (rows.find(row => row.id === previous.id) ?? previous) as unknown as T);
  }, [context.loading, context.snapshot, context.ownRevision, context.mutationView, context.mutationBaselines, view]);
  return [draft, setDraft];
}
