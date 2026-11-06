'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from './AdminShell';
import AdminTabs from './AdminTabs';
import ColorField from './ColorField';
import ImageUpload from './ImageUpload';
import LogoSizeField from './LogoSizeField';
import WebsitePreview from './WebsitePreview';
import { defaultBrandSettings } from '../../lib/branding-defaults';
import { type BrandingSnapshot, brandingRequest, clearPendingImages, persistImage } from './branding-client';

export type BrandSettings = { logo: string; logoWidth: number; navAlignment: 'left' | 'center' | 'right'; hero: string; primaryColor: string; headerColor: string; footerColor: string; footerTextColor: string; accentColor: string; textColor: string; eyebrow: string; subtitle: string; heading: string; alignment: 'left' | 'center' | 'right'; overlay: number };
export type Category = { id: string; image: string; name: string; order: number; visible: boolean; description?: string; externalCategoryId?: string };
type WorkspaceData = { settings: BrandSettings; categories: Category[] };

const defaultData: WorkspaceData = { settings: { ...defaultBrandSettings }, categories: [
  { id: 'popular', image: '/images/category-1.jpg', name: 'Popular', order: 1, visible: true }, { id: 'biryani', image: '/images/biryani.jpg', name: 'Biryani', order: 2, visible: true }, { id: 'curries', image: '/images/category-3.jpg', name: 'Curries', order: 3, visible: true }, { id: 'kebabs', image: '/images/category-4.jpg', name: 'Kebabs', order: 4, visible: true }, { id: 'wraps', image: '/images/wrap.jpg', name: 'Wraps & Rolls', order: 5, visible: true }, { id: 'beverages', image: '/images/lassi.jpg', name: 'Beverages', order: 6, visible: true },
] };

export function cloneData() { return JSON.parse(JSON.stringify(defaultData)) as WorkspaceData; }

export default function BrandingWorkspace() {
  const router = useRouter(); const [data, setData] = useState<WorkspaceData>(cloneData); const [savedData, setSavedData] = useState<WorkspaceData>(cloneData); const [mobile, setMobile] = useState(false); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [stores, setStores] = useState<{store_code: string; storename: string}[]>([]);
  const [storeCode, setStoreCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [heroId, setHeroId] = useState<string | null>(null);
  function fromSnapshot(snapshot: BrandingSnapshot): WorkspaceData {
    const b = snapshot.branding; const h = snapshot.hero;
    return { settings: { ...defaultData.settings, ...(b ? { logo: b.logoUrl || defaultBrandSettings.logo, logoWidth: b.logoWidth, navAlignment: (b.navAlignment || 'left') as BrandSettings['navAlignment'], primaryColor: b.primaryColor, headerColor: b.headerColor, footerColor: b.footerColor, footerTextColor: b.footerTextColor, accentColor: b.accentColor } : {}), ...(h ? { hero: h.imageUrl, eyebrow: h.eyebrow || '', subtitle: h.subtitle || '', heading: h.heading || '', textColor: h.textColor, alignment: h.alignment as BrandSettings['alignment'], overlay: h.overlayOpacity } : {}) }, categories: snapshot.categories.map((c) => ({ id: c.id, image: c.imageUrl || '', name: c.categoryName, order: c.displayOrder, visible: c.isVisible, description: c.description || undefined, externalCategoryId: c.externalCategoryId || undefined })) };
  }
  useEffect(() => {
    let active = true;
    fetch('/api/admin/stores', { cache: 'no-store' }).then(async response => { const result = await response.json() as { error?: string; stores: {store_code: string; storename: string}[] }; if (!response.ok) throw new Error(result.error); return result; }).then(result => {
      if (!active) return;
      const options = result.stores.filter((s) => s.store_code);
      setStores(options);
      const requested = new URLSearchParams(window.location.search).get('store_code');
      setStoreCode(options.some((s) => s.store_code === requested) ? requested! : options[0]?.store_code || '');
      if (!options.length) { setLoading(false); setNotice({ type: 'error', text: 'Create a store before configuring branding.' }); }
    }).catch(error => { if (active) { setLoading(false); setNotice({ type: 'error', text: error.message }); } });
    return () => { active = false; clearPendingImages(); };
  }, []);
  useEffect(() => {
    if (!storeCode) return;
    let active = true; setLoading(true); setNotice(null);
    brandingRequest(`/api/admin/branding/workspace?store_code=${encodeURIComponent(storeCode)}`).then(snapshot => {
      if (!active) return;
      const loaded = fromSnapshot(snapshot); setData(loaded); setSavedData(loaded); setHeroId(snapshot.hero?.id || null); clearPendingImages(); setLoading(false);
    }).catch(error => { if (active) { setNotice({ type: 'error', text: error.message }); setLoading(true); } });
    return () => { active = false; };
  }, [storeCode]);
  const validColors = useMemo(() => [data.settings.primaryColor, data.settings.headerColor, data.settings.footerColor, data.settings.footerTextColor, data.settings.accentColor, data.settings.textColor].every((value) => /^#[0-9A-Fa-f]{6}$/.test(value as string)), [data.settings]);
  function updateSettings(patch: Partial<BrandSettings>) { setData((current) => ({ ...current, settings: { ...current.settings, ...patch } })); setNotice(null); }
  function cancel() { setData(JSON.parse(JSON.stringify(savedData)) as WorkspaceData); setNotice({ type: 'success', text: 'Unsaved changes were discarded.' }); }
  async function save() {
    if (loading || !storeCode || saving) return;
    if ((!Number.isInteger(data.settings.logoWidth) || data.settings.logoWidth < 24 || data.settings.logoWidth > 400)) { setNotice({ type: 'error', text: 'Logo width must be a whole number from 24 to 400 pixels.' }); return; }
    if (!validColors) { setNotice({ type: 'error', text: 'Please enter valid six-digit HEX colors.' }); return; }
    setSaving(true); setNotice(null);
    try {
      const s = data.settings;
      const logo = await persistImage(s.logo, storeCode); const hero = await persistImage(s.hero, storeCode);
      const body = { section: 'Branding', heroId, branding: { logoUrl: logo, logoWidth: s.logoWidth, navAlignment: s.navAlignment, primaryColor: s.primaryColor, headerColor: s.headerColor, footerColor: s.footerColor, footerTextColor: s.footerTextColor, accentColor: s.accentColor }, hero: { imageUrl: hero, eyebrow: s.eyebrow, subtitle: s.subtitle, heading: s.heading, textColor: s.textColor, alignment: s.alignment, overlayOpacity: s.overlay } };
      const snapshot = await brandingRequest(`/api/admin/branding/workspace?store_code=${encodeURIComponent(storeCode)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const persisted = fromSnapshot(snapshot);
      setData(current => ({ ...current, settings: persisted.settings }));
      setSavedData(current => ({ ...current, settings: persisted.settings }));
      setHeroId(snapshot.hero?.id || null);
      setNotice({ type: 'success', text: 'Changes saved successfully.' });
    } catch (error) { setNotice({ type: 'error', text: (error as Error).message }); }
    finally { setSaving(false); }
  }
  async function signOut() { await fetch('/api/admin/logout', { method: 'POST' }); router.replace('/admin/login'); }
  return <AdminShell active="Branding" pageTitle="Website Branding" pageSubtitle="Customize your online ordering website." onSignOut={signOut}><div className="p-5 sm:p-8"><label className="mb-4 block text-xs font-bold text-[#183f70]">Store <select aria-label="Branding store" value={storeCode} disabled={saving} onChange={event => { if (JSON.stringify(data) === JSON.stringify(savedData) || window.confirm('Discard unsaved changes and switch store?')) { setLoading(true); setStoreCode(event.target.value); } }} className="ml-2 rounded border border-slate-200 bg-white p-2">{stores.map(store => <option key={store.store_code} value={store.store_code}>{store.storename} ({store.store_code})</option>)}</select></label>{loading && <p className="mb-3 text-xs">Loading saved branding...</p>}<fieldset disabled={saving || loading}><AdminTabs /><div className="mt-3 grid items-start gap-2 xl:grid-cols-[minmax(470px,1fr)_minmax(450px,1.2fr)]"><BrandingEditor settings={data.settings} updateSettings={updateSettings} /><WebsitePreview storeCode={loading ? '' : storeCode} settings={data.settings} categories={data.categories} mobile={mobile} onMobileChange={setMobile} /></div>{notice && <p data-notice-tone={notice.type} role={notice.type === 'error' ? 'alert' : 'status'} className={`mt-3 rounded-md px-3 py-2 text-xs font-bold ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{notice.text}</p>}<div className="mt-3 flex justify-end gap-2"><button onClick={cancel} className="rounded-md border border-[#183f70] bg-white px-6 py-2 text-xs font-bold text-[#183f70]">Cancel</button><button onClick={save} disabled={saving || loading} className="rounded-md bg-[#183f70] px-7 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save Changes'}</button></div></fieldset></div></AdminShell>;
}

function BrandingEditor({ settings, updateSettings }: { settings: BrandSettings; updateSettings: (patch: Partial<BrandSettings>) => void }) { return <div className="space-y-4"><section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><h2 className="text-base font-extrabold text-[#183f70]">Logo & Colors</h2><p className="text-[10px] text-slate-400">Upload your restaurant logo and customize the colors used across your website.</p><div className="mt-3 grid gap-4 sm:grid-cols-[150px_1fr]"><div className="min-w-0"><ImageUpload label="Store Logo" value={settings.logo} onChange={(logo) => updateSettings({ logo })} compact helper="PNG, WebP or JPG · Max 2MB" /><LogoSizeField value={settings.logoWidth} onChange={(logoWidth) => updateSettings({ logoWidth })} /></div><div className="space-y-2 pt-1"><fieldset><legend className="mb-1 text-[11px] font-semibold text-[#183f70]">Navbar Menu Position</legend><div className="flex overflow-hidden rounded border border-slate-200">{(['left', 'center', 'right'] as const).map((position) => <button key={position} type="button" aria-pressed={settings.navAlignment === position} onClick={() => updateSettings({ navAlignment: position })} className={`flex-1 px-3 py-2 text-xs font-semibold capitalize ${settings.navAlignment === position ? 'bg-[#183f70] text-white' : 'text-[#183f70]'}`}>{position}</button>)}</div><p className="mt-1 text-[10px] text-slate-400">Position of the menu links in the desktop navbar.</p></fieldset><ColorField label="Primary Color" value={settings.primaryColor} onChange={(primaryColor) => updateSettings({ primaryColor })} /><ColorField label="Header Color" value={settings.headerColor} onChange={(headerColor) => updateSettings({ headerColor })} /><ColorField label="Footer Color" value={settings.footerColor} onChange={(footerColor) => updateSettings({ footerColor })} /><ColorField label="Footer Text Color" value={settings.footerTextColor} onChange={(footerTextColor) => updateSettings({ footerTextColor })} /><ColorField label="Accent Color" value={settings.accentColor} onChange={(accentColor) => updateSettings({ accentColor })} /></div></div></section><section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><h2 className="text-base font-extrabold text-[#183f70]">Hero Banner</h2><p className="text-[10px] text-slate-400">Upload a hero banner image and customize the text that appears on it.</p><ImageUpload label="Banner Image" value={settings.hero} onChange={(hero) => updateSettings({ hero })} helper="Recommended: 1920 × 400px" /><div className="mt-3 space-y-2"><TextField label="Eyebrow Text" value={settings.eyebrow} onChange={(eyebrow) => updateSettings({ eyebrow })} /><TextField label="Subtitle" value={settings.subtitle} onChange={(subtitle) => updateSettings({ subtitle })} /><label className="flex items-start gap-2 text-[11px] font-semibold text-[#183f70]"><span className="w-20 shrink-0 pt-2">Heading</span><textarea value={settings.heading} onChange={(event) => updateSettings({ heading: event.target.value })} rows={2} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:border-[#183f70]" /></label><ColorField label="Text Color" value={settings.textColor} onChange={(textColor) => updateSettings({ textColor })} /><div className="flex items-center gap-2 text-[11px] font-semibold text-[#183f70]"><span className="w-20 shrink-0">Alignment</span><div className="flex flex-1 rounded border border-slate-200"><button onClick={() => updateSettings({ alignment: 'left' })} className={`flex-1 py-1.5 ${settings.alignment === 'left' ? 'bg-[#183f70] text-white' : ''}`}>Left</button><button onClick={() => updateSettings({ alignment: 'center' })} className={`flex-1 border-x border-slate-200 py-1.5 ${settings.alignment === 'center' ? 'bg-[#183f70] text-white' : ''}`}>Center</button><button onClick={() => updateSettings({ alignment: 'right' })} className={`flex-1 py-1.5 ${settings.alignment === 'right' ? 'bg-[#183f70] text-white' : ''}`}>Right</button></div></div><label className="flex items-center gap-2 text-[11px] font-semibold text-[#183f70]"><span className="w-20 shrink-0">Overlay</span><input type="range" min="0" max="80" value={settings.overlay} onChange={(event) => updateSettings({ overlay: Number(event.target.value) })} className="flex-1 accent-[#1686ed]" /><span className="w-10 rounded border border-slate-200 px-1 py-1 text-center">{settings.overlay}%</span></label></div></section></div>; }

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="flex items-center gap-2 text-[11px] font-semibold text-[#183f70]"><span className="w-20 shrink-0">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-[#183f70]" /></label>; }

