'use client';

import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { menuScreenHref, menuSections } from '../../lib/admin-menu';
import { useLegacyMenu } from './legacy-menu-client';

export const navigation = menuSections.map(section => section.label);

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
 const paths: Record<string, ReactNode> = {
 search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>, plus: <path d="M12 4v16M4 12h16" />, upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6" /></>, filter: <path d="M4 4h16l-6 7v8l-4 2V11z" />, edit: <><path d="m14 5 5 5M4 16 16 4a2 2 0 0 1 4 4L8 20H4zM13 21h8V11" /></>, copy: <><rect x="8" y="7" width="12" height="14" rx="2" /><path d="M15 7V3H3v14h5m4-6h4m-4 4h4" /></>, trash: <><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></>, Items: <><path d="M3 11a9 9 0 0 1 18 0zM3 15h18M4 19h16M7 11v4m5-4v4m5-4v4" /></>, Categories: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>, Variants: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M10 3v18M6 7h1m-1 5h1m-1 5h1m7-10h3m-3 5h3m-3 5h3" /></>, 'Modifier Groups': <><path d="M3 6h18M3 12h18M3 18h18M8 3v6m8 0v6m-8 0v6" /><circle cx="8" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>, 'Combo Master': <><path d="m12 2 10 6-10 6L2 8zM2 8v9l10 5 10-5V8M12 14v8" /></>, Offers: <><path d="M3 3h8l10 10-8 8L3 11z" /><circle cx="7" cy="7" r="1" /></>, 'Tax Rules': <><path d="m5 20 14-16M4 4v6h6m4 4v6h6" /><circle cx="7" cy="6" r="2" /><circle cx="17" cy="18" r="2" /></>, Inventory: <><path d="M4 7h16l1 14H3zM8 9V5a4 4 0 0 1 8 0v4" /></>, Schedules: <><circle cx="12" cy="13" r="9" /><path d="M12 7v6l4 2M9 1h6m3 3 2-2" /></>, Pricing: <><path d="m12 2 3 2 4 1 1 4 2 3-2 3-1 4-4 1-3 2-3-2-4-1-1-4-2-3 2-3 1-4 4-1zM8 12l3 3 5-6" /></>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.Pricing}</svg>;
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) { return <button type="button" className={`mw-toggle ${checked ? 'is-on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span /></button>; }
export function Field({ label, required, children, error }: { label: string; required?: boolean; children: ReactNode; error?: string }) {
 const errorId = useId();
 return <label className="mw-field" data-field-label={label}><span>{label}{required && <b> *</b>}</span>{Children.map(children, child => error && isValidElement(child) && typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type) ? cloneElement(child as ReactElement<Record<string, unknown>>, { 'aria-invalid': true, 'aria-describedby': errorId }) : child)}{error && <small id={errorId} data-validation-error>{error}</small>}</label>;
}

export function MenuNavigation({ active, onChange }: { active: string; onChange: (section: string) => void }) {
 const menu = useLegacyMenu();
 const pathname = usePathname(); const router = useRouter(); const params = useSearchParams();
 return <div className="mw-menu-controls">
  <label className="mw-store-picker"><span>Store</span><select aria-label="Select store for menu" value={menu.storeCode} onChange={event => { const next = new URLSearchParams(params.toString()); next.set('store_code', event.target.value); router.replace(`${pathname}?${next.toString()}`, { scroll: false }); }}>
   {menu.stores.map(store => <option key={store.store_code} value={store.store_code}>{store.storename ? `${store.storename} (${store.store_code})` : store.store_code}</option>)}
  </select></label>
  <nav className="mw-navigation" aria-label="Menu management">{menuSections.filter(section => menu.canCreate(section.view)).map(({ label: name }) => <a href={menuScreenHref(name) + (menu.storeCode ? '&store_code=' + encodeURIComponent(menu.storeCode) : '')} key={name} aria-current={active === name ? 'page' : undefined} className={active === name ? 'is-active' : ''} onClick={event => { if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); onChange(name); }}><Icon name={name} />{name}</a>)}</nav>
 </div>;
}
