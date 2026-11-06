'use client';
import { useLegacyCollection, useLegacyDraft, useLegacyMenu } from './legacy-menu-client';
import { blankLegacy, legacyRows, type LegacyRow } from '../../lib/menu-legacy-codec';

import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type FormEvent, type KeyboardEvent } from 'react';
import { Field as BaseField, Icon, MenuNavigation, Toggle } from './MenuControls';
import { validateOfferForm, type OfferIssue } from '../../lib/offer-form-validation';
import './offer-validation.css';

const OfferErrors = createContext<Record<string, string>>({});
function Field(props: ComponentProps<typeof BaseField>) {
  const errors = useContext(OfferErrors);
  return <BaseField {...props} error={errors[props.label]} />;
}

const tabs = ['Basic Info', 'Conditions', 'Apply To Items', 'Schedule', 'Advanced'];
const offerTypes = ['Percentage Discount', 'Fixed Amount', 'Buy 1 Get 1 Free', 'Free Delivery'] as const;
type OfferType = typeof offerTypes[number];
type Offer = {
  id: number; name: string; type: OfferType; value: number; minimum: number; description: string;
  start: string; end: string; usage: number; maxDiscount: number; active: boolean; stacking: boolean;
  website: boolean; app: boolean; buyQty: number; getQty: number; minItems: number; customer: string;
  scope: string; items: string[]; categories: string[]; days: string[]; startTime: string; endTime: string;
  code: string; externalId: string; priority: number; perCustomer: number; image: string;
};
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const menuItems = ['Chicken Biryani', 'Pizza Meal Combo', 'Paneer Pizza', 'Veg Burger', 'French Fries', 'Masala Dosa', 'Butter Chicken', 'Paneer Tikka', 'Chole Bhature', 'Gulab Jamun'];
const menuCategories = ['Biryani', 'Dinner', 'Combos', 'Pizza', 'Burger', 'Sides', 'Breakfast', 'Desserts'];
const rows: [string, OfferType, number, string, string][] = [
  ['Flat 10% Off', 'Percentage Discount', 10, '2026-10-01', '2026-10-31'],
  ['Buy 1 Get 1 Free', 'Buy 1 Get 1 Free', 1, '2026-10-05', '2026-11-05'],
  ['$5 Off on $50+', 'Fixed Amount', 5, '2026-10-10', '2026-11-10'],
  ['Free Delivery', 'Free Delivery', 0, '2026-10-15', '2026-12-31'],
  ['Dinner Special', 'Percentage Discount', 20, '2026-10-20', '2026-11-20'],
  ['Combo Discount', 'Fixed Amount', 3, '2026-10-25', '2026-11-25'],
];
const sampleinitialOffers: Offer[] = rows.map(([name, type, value, start, end], index) => ({
  id: index + 1, name, type, value, start, end, minimum: index === 2 ? 50 : 0,
  description: index === 0 ? 'Get 10% off on all items. Limited time offer!' : index === 1 ? 'Buy one item and get another one free!' : index === 2 ? 'Save $5 when you spend $50 or more.' : index === 3 ? 'Enjoy free delivery on your next order.' : index === 4 ? 'Save 20% on your favorite dinner dishes.' : 'Save $3 on your favorite meal combos.',
  usage: 0, maxDiscount: 0, active: index !== 4, stacking: false, website: true, app: true,
  buyQty: 1, getQty: 1, minItems: 1, customer: 'All Customers', scope: index === 4 ? 'Selected Categories' : index === 5 ? 'Selected Items' : 'All Items',
  items: index === 5 ? ['Pizza Meal Combo'] : [], categories: index === 4 ? ['Dinner'] : [], days: [...weekdays],
  startTime: '00:00', endTime: '23:59', code: '', externalId: `OFFER-${String(index + 1).padStart(3, '0')}`, priority: index + 1, perCustomer: 0, image: '',
}));
const copyOffer = (offer: Offer): Offer => ({ ...offer, items: [...offer.items], categories: [...offer.categories], days: [...offer.days] });
const shortType = (type: OfferType) => type === 'Percentage Discount' ? 'Percentage' : type === 'Buy 1 Get 1 Free' ? 'BOGO' : type;
const offerValue = (offer: Offer) => offer.type === 'Percentage Discount' ? `${offer.value}%` : offer.type === 'Buy 1 Get 1 Free' ? `${offer.buyQty}+${offer.getQty}` : offer.type === 'Free Delivery' ? '$0' : `$${offer.value.toFixed(2)}`;
const dateLabel = (date: string) => date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : 'Not set';

function OfferArt({ offer, large = false }: { offer: Offer; large?: boolean }) {
  if (offer.image) return <img className={`offer-custom-art ${large ? 'is-large' : ''}`} src={offer.image} alt={offer.name || 'Offer image'} />;
  const delivery = offer.type === 'Free Delivery'; const bogo = offer.type === 'Buy 1 Get 1 Free'; const combo = offer.name === 'Combo Discount';
  return <div className={`offer-art ${large ? 'is-large' : ''} ${delivery ? 'is-delivery' : ''} ${bogo ? 'is-bogo' : ''} ${combo ? 'is-combo' : ''}`} aria-label={`${offer.name}: ${offerValue(offer)}`} role="img">
    <div className="offer-art-copy">{delivery ? <><strong>FREE</strong><span>DELIVERY</span></> : bogo ? <><strong>BUY {offer.buyQty}</strong><span>GET {offer.getQty}{large ? ' FREE' : ''}</span></> : combo && !large ? <><strong>COMBO</strong><span>DEAL</span></> : <><strong>{offer.type === 'Percentage Discount' ? `${offer.value}%` : `$${offer.value}`}{large && <em>OFF</em>}</strong><span>{large ? offer.scope === 'All Items' ? 'ON ALL ITEMS' : 'LIMITED TIME OFFER' : 'OFF'}</span></>}</div>
    {large && <div className="offer-art-food"><img src="/images/biryani.jpg" alt="" /><img src="/images/wrap.jpg" alt="" /><img src="/images/chicken.jpg" alt="" /></div>}
  </div>;
}

export default function OffersWorkspace({ hidden = false, onNavigate }: { hidden?: boolean; onNavigate: (section: string) => void }) {
  const menu = useLegacyMenu(); const canCreate = menu.canCreate('offers');
  const initialOffers = [blankLegacy('offers', sampleinitialOffers[0] as unknown as LegacyRow, menu.snapshot) as unknown as Offer];
  const databaseItems = legacyRows(menu.snapshot, 'items');
  const databaseCategories = legacyRows(menu.snapshot, 'categories').map(row => row.name as string);
  const menuItems = databaseItems.map(row => row.name as string);
  const menuCategories = databaseCategories;

  const [offers, setOffers] = useLegacyCollection<Offer>('offers'); const [draft, setDraft] = useLegacyDraft<Offer>('offers', initialOffers[0]);
  const [tab, setTab] = useState('Basic Info'); const [query, setQuery] = useState(''); const [type, setType] = useState('All Types'); const [status, setStatus] = useState('All Status');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const [localNotice, setLocalNotice] = useState(''); const notice = menu.error || (menu.loading ? 'Loading menu…' : localNotice); const [deleting, setDeleting] = useState<Offer | null>(null);
  const [noticeTone, setNoticeTone] = useState<'success' | 'error' | 'info'>('info');
  function setNotice(message: string, tone: 'success' | 'error' | 'info' = 'info') { setLocalNotice(message); setNoticeTone(tone); }
  const [itemSearch, setItemSearch] = useState('');
  const [issues, setIssues] = useState<OfferIssue[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [focusField, setFocusField] = useState('');
  const nameRef = useRef<HTMLInputElement>(null); const importRef = useRef<HTMLInputElement>(null); const imageRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null); const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const filtered = offers.filter(offer => offer.name.toLowerCase().includes(query.trim().toLowerCase()) && (type === 'All Types' || offer.type === type) && (status === 'All Status' || offer.active === (status === 'Active')));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages);
  const visibleRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const update = <K extends keyof Offer>(key: K, value: Offer[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(previous => ({ ...previous, [key]: value }));
    if (attempted) setIssues(validateOfferForm(next, offers));
    menu.clearError(); setNotice('');
  };
  useEffect(() => { if (deleting) cancelDeleteRef.current?.focus(); }, [deleting]);
  useEffect(() => {
    if (!focusField) return;
    const labels = document.querySelectorAll<HTMLLabelElement>('#offer-form label[data-field-label]');
    Array.from(labels).find(label => label.dataset.fieldLabel === focusField)?.querySelector<HTMLElement>('input,select,textarea')?.focus();
    setFocusField('');
  }, [tab, focusField]);


  function edit(offer: Offer) { setDraft(copyOffer(offer)); setTab('Basic Info'); setNotice(''); setIssues([]); setAttempted(false); menu.clearError(); }
  function add() { setDraft({ ...copyOffer(initialOffers[0]), id: Date.now(), name: '', description: '', value: 0, externalId: '', code: '', image: '' }); setTab('Basic Info'); setNotice(''); setIssues([]); setAttempted(false); menu.clearError(); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    menu.clearError(); setNotice(''); setAttempted(true);
    const errors = validateOfferForm(draft, offers);
    setIssues(errors);
    if (errors.length) { setTab(errors[0].tab); setFocusField(errors[0].field); return; }
    const saved = copyOffer({ ...draft, name: draft.name.trim() });
    setSaving(true);
    try {
      if (!await setOffers(previous => previous.some(offer => offer.id === saved.id) ? previous.map(offer => offer.id === saved.id ? saved : offer) : [...previous, saved])) return;
      setDraft(saved); setAttempted(false); setNotice('Offer saved to the database.', 'success');
    } finally { setSaving(false); }
  }
  async function toggleStatus(offer: Offer) { if (!await setOffers(previous => previous.map(value => value.id === offer.id ? { ...value, active: !value.active } : value))) return; if (draft.id === offer.id) update('active', !offer.active); }
  function closeDelete() { setDeleting(null); deleteTriggerRef.current?.focus(); }
  async function remove() { if (!deleting) return; const remaining = offers.filter(offer => offer.id !== deleting.id); if (!await setOffers(remaining)) return; if (draft.id === deleting.id) { if (remaining[0]) edit(remaining[0]); else add(); } setDeleting(null); setNotice('Offer archived in the database.', 'success'); }
  function dialogKeys(event: KeyboardEvent<HTMLElement>) { if (event.key === 'Escape') closeDelete(); if (event.key === 'Tab') { const buttons = event.currentTarget.querySelectorAll('button'); const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }
  function uploadImage(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setNotice('Choose a JPG, PNG or WebP image smaller than 2 MB.', 'error'); return; }
    const reader = new FileReader(); reader.onload = () => update('image', String(reader.result)); reader.onerror = () => setNotice('The image could not be read.', 'error'); reader.readAsDataURL(file);
  }
  async function importOffers(file?: File) {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text()); const records = Array.isArray(data) ? data : data && typeof data === 'object' && 'offers' in data ? data.offers : null;
      if (!Array.isArray(records) || !records.length) throw new Error();
      const stamp = Date.now();
      const imported: Offer[] = records.map((record: unknown, index: number) => {
        if (!record || typeof record !== 'object' || !('name' in record) || typeof record.name !== 'string' || !record.name.trim() || !('value' in record) || typeof record.value !== 'number' || !Number.isFinite(record.value) || record.value < 0) throw new Error();
        const offerType = 'type' in record && offerTypes.includes(record.type as OfferType) ? record.type as OfferType : 'Percentage Discount';
        if (offerType === 'Percentage Discount' && record.value > 100) throw new Error();
        return { ...copyOffer(initialOffers[0]), id: stamp + index, name: record.name.trim(), type: offerType, value: record.value, description: '', externalId: `OFFER-IMPORT-${stamp}-${index + 1}` };
      });
      const names = [...offers, ...imported].map(offer => offer.name.toLowerCase()); if (new Set(names).size !== names.length) { setNotice('Import contains duplicate offer names. Please use unique names.', 'error'); return; }
      if (!await setOffers(previous => [...previous, ...imported])) return; setNotice(`${imported.length} offers imported with demo schedule defaults.`, 'success');
    } catch { setNotice('Use a JSON array with name and numeric value fields, or an object with an offers array.', 'error'); }
  }
  const limits = <div className="mw-form-row"><Field label="Usage Limit"><input type="number" min={0} step={1} value={draft.usage} onChange={event => update('usage', Number(event.target.value))} /><small>0 = Unlimited</small></Field><Field label="Max Discount Amount"><input type="number" min={0} step="0.01" value={draft.maxDiscount} onChange={event => update('maxDiscount', Number(event.target.value))} /><small>0 = No limit</small></Field></div>;
  const dates = <div className="mw-form-row offer-date-fields"><Field label="Start Date" required><input type="date" value={draft.start} onChange={event => update('start', event.target.value)} /></Field><Field label="End Date" required><input type="date" min={draft.start} value={draft.end} onChange={event => update('end', event.target.value)} /></Field></div>;

  return <OfferErrors.Provider value={Object.fromEntries(issues.map(issue => [issue.field, issue.message]))}><div className="mw-workspace offers-workspace" hidden={hidden}>
    <div className="mw-page-heading"><div><h1>Menu Management</h1><p>Add, edit and organize your menu items, categories, variants, modifiers and more.</p></div><div className="mw-heading-actions">{false && <button className="mw-button mw-outline" disabled title="હજુ ઉપલબ્ધ નથી"><Icon name="upload" />Import POS JSON</button>}<button style={{ display: canCreate ? undefined : 'none' }} className="mw-button mw-primary" onClick={add}><Icon name="plus" />Add Offer</button></div></div>
    <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={event => { void importOffers(event.target.files?.[0]); event.target.value = ''; }} />
    <MenuNavigation active="Offers" onChange={onNavigate} />
    {notice && <div className="mw-notice" data-notice-tone={menu.error ? 'error' : menu.loading ? 'info' : noticeTone} role={menu.error || noticeTone === 'error' ? 'alert' : 'status'}>{notice}<button aria-label="Dismiss offer notification" onClick={() => { setNotice(''); menu.clearError(); }}>×</button></div>}
    <div className="mw-columns offer-columns"><section className="mw-panel offer-list" aria-labelledby="offers-heading"><h2 id="offers-heading">Offers ({offers.length})</h2>
      <div className="mw-search-row"><div className="mw-search"><Icon name="search" size={19} /><input aria-label="Search offers" placeholder="Search offers..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><button className="mw-icon-button" aria-label="Reset offer filters" title="Reset filters" onClick={() => { setQuery(''); setType('All Types'); setStatus('All Status'); setPage(1); }}><Icon name="filter" size={19} /></button></div>
      <div className="mw-filters offer-filters"><select aria-label="Filter offer type" value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option>All Types</option>{offerTypes.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filter offer status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option>All Status</option><option>Active</option><option>Inactive</option></select></div>
      <div className="mw-table-scroll"><table className="mw-table offer-table"><thead><tr>{['#', 'Image', 'Offer Name', 'Type', 'Value', 'Start Date', 'End Date', 'Status', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{visibleRows.map((offer, index) => <tr key={offer.id}><td>{(currentPage - 1) * pageSize + index + 1}</td><td><button className="offer-thumbnail" aria-label={`Edit ${offer.name} artwork`} onClick={() => edit(offer)}><OfferArt offer={offer} /></button></td><td><button className="mw-name" onClick={() => edit(offer)}>{offer.name}</button></td><td className="mw-muted">{shortType(offer.type)}</td><td>{offerValue(offer)}</td><td className="mw-muted">{dateLabel(offer.start)}</td><td className="mw-muted">{dateLabel(offer.end)}</td><td><Toggle checked={offer.active} label={`${offer.name} active`} onChange={() => toggleStatus(offer)} /></td><td><div className="mw-row-actions"><button aria-label={`Edit ${offer.name}`} onClick={() => edit(offer)}><Icon name="edit" size={18} /></button><button className="mw-delete" aria-label={`Delete ${offer.name}`} onClick={event => { deleteTriggerRef.current = event.currentTarget; setDeleting(offer); }}><Icon name="trash" size={18} /></button></div></td></tr>)}</tbody></table>{!visibleRows.length && <div className="mw-empty">No offers match your search and filters.</div>}</div>
      <div className="mw-pagination offer-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} offers</span><div><button aria-label="Previous offers page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: pages }, (_, index) => index + 1).filter(number => number === 1 || number === pages || Math.abs(number - currentPage) <= 1).map(number => <button key={number} aria-label={`Offers page ${number}`} aria-current={number === currentPage ? 'page' : undefined} className={number === currentPage ? 'is-active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button aria-label="Next offers page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button><select aria-label="Offers per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={5}>5 / page</option><option value={20}>20 / page</option></select></div></div>
    </section>
    <section className="mw-panel offer-editor" style={{ display: canCreate || (draft as unknown as { _dbId?: string })._dbId ? undefined : 'none' }} aria-labelledby="offer-editor-heading"><h2 id="offer-editor-heading">Add / Edit Offer</h2><div className="mw-editor-tabs offer-tabs" role="tablist" aria-label="Offer settings">{tabs.map((value, index) => <button type="button" key={value} role="tab" id={`offer-tab-${index}`} aria-controls="offer-tab-panel" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)}>{value}</button>)}</div>
      <div className="offer-editor-content"><form className="offer-form" id="offer-form" onSubmit={save} noValidate><div className="offer-tab-panel" id="offer-tab-panel" role="tabpanel" aria-labelledby={`offer-tab-${tabs.indexOf(tab)}`}>
        {tab === 'Basic Info' && <><div className="mw-form-row offer-identity"><Field label="Offer Name" required><input ref={nameRef} maxLength={100} value={draft.name} placeholder="Enter offer name" onChange={event => update('name', event.target.value)} /></Field><Field label="Offer Type" required><select value={draft.type} onChange={event => update('type', event.target.value as OfferType)}>{offerTypes.map(value => <option key={value}>{value}</option>)}</select></Field></div><div className="mw-form-row">{draft.type === 'Buy 1 Get 1 Free' ? <Field label="Buy Quantity" required><input type="number" min={1} step={1} value={draft.buyQty} onChange={event => update('buyQty', Number(event.target.value))} /></Field> : <Field label={draft.type === 'Percentage Discount' ? 'Discount Value (%)' : 'Discount Value ($)'} required><input type="number" min={0} max={draft.type === 'Percentage Discount' ? 100 : undefined} step={draft.type === 'Percentage Discount' ? '1' : '0.01'} disabled={draft.type === 'Free Delivery'} value={draft.type === 'Free Delivery' ? 0 : draft.value} onChange={event => update('value', Number(event.target.value))} /></Field>}<Field label="Minimum Order Amount"><input type="number" min={0} step="0.01" value={draft.minimum} onChange={event => update('minimum', Number(event.target.value))} /></Field></div><Field label="Description"><textarea maxLength={500} value={draft.description} onChange={event => update('description', event.target.value)} /><small>{draft.description.length}/500</small></Field>{dates}{limits}<div className="offer-toggle-grid">{([['active', 'Active'], ['stacking', 'Allow with Other Offers'], ['website', 'Show on Website'], ['app', 'Show in App']] as const).map(([key, label]) => <div key={key}><Toggle checked={draft[key]} label={label} onChange={() => update(key, !draft[key])} /><span>{label}</span></div>)}</div></>}
        {tab === 'Conditions' && <><h3>Offer Conditions</h3><p className="mw-help">Set eligibility and redemption limits for this offer.</p><div className="mw-form-row"><Field label="Minimum Order Amount"><input type="number" min={0} step="0.01" value={draft.minimum} onChange={event => update('minimum', Number(event.target.value))} /></Field><Field label="Minimum Item Quantity"><input type="number" min={1} value={draft.minItems} onChange={event => update('minItems', Number(event.target.value))} /></Field></div><Field label="Customer Eligibility"><select value={draft.customer} onChange={event => update('customer', event.target.value)}><option>All Customers</option><option>New Customers</option><option value="Existing Customers">Returning Customers</option></select></Field>{draft.type === 'Buy 1 Get 1 Free' && <div className="mw-form-row"><Field label="Buy Quantity"><input type="number" min={1} value={draft.buyQty} onChange={event => update('buyQty', Number(event.target.value))} /></Field><Field label="Get Free Quantity"><input type="number" min={1} value={draft.getQty} onChange={event => update('getQty', Number(event.target.value))} /></Field></div>}{limits}<Field label="Usage Limit per Customer"><input type="number" min={0} step={1} value={draft.perCustomer} onChange={event => update('perCustomer', Number(event.target.value))} /><small>0 = Unlimited</small></Field></>}
        {tab === 'Apply To Items' && <><h3>Apply To Items</h3><p className="mw-help">Choose which menu items qualify for this offer.</p><Field label="Apply Offer To"><select value={draft.scope} onChange={event => update('scope', event.target.value)}><option>All Items</option><option>Selected Items</option><option>Selected Categories</option></select></Field>{draft.scope === 'All Items' ? <div className="offer-application-summary"><Icon name="Items" size={25} /><strong>All menu items</strong><p>This offer applies to every item on your menu.</p></div> : <><Field label={draft.scope === 'Selected Items' ? 'Search Items' : 'Search Categories'}><input placeholder="Search..." value={itemSearch} onChange={event => setItemSearch(event.target.value)} /></Field><div className="offer-item-choices">{(draft.scope === 'Selected Items' ? menuItems : menuCategories).filter(value => value.toLowerCase().includes(itemSearch.toLowerCase())).map(value => { const key = draft.scope === 'Selected Items' ? 'items' : 'categories'; return <label key={value}><input type="checkbox" checked={draft[key].includes(value)} onChange={() => update(key, draft[key].includes(value) ? draft[key].filter(name => name !== value) : [...draft[key], value])} /><span>{value}</span></label>; })}</div></>}</>}
        {tab === 'Schedule' && <><h3>Offer Schedule</h3><p className="mw-help">Choose when this offer is available to customers.</p>{dates}<div className="mw-field"><span>Available Days</span>{issues.find(issue => issue.field === 'Available Days') && <small data-validation-error>Select at least one available day.</small>}<div className="mw-days">{weekdays.map(day => <button key={day} type="button" className={draft.days.includes(day) ? 'is-active' : ''} onClick={() => update('days', draft.days.includes(day) ? draft.days.filter(value => value !== day) : [...draft.days, day])}>{day}</button>)}</div></div><div className="mw-form-row"><Field label="Start Time"><input type="time" value={draft.startTime} onChange={event => update('startTime', event.target.value)} /></Field><Field label="End Time"><input type="time" value={draft.endTime} onChange={event => update('endTime', event.target.value)} /></Field></div><p className="offer-schedule-note">Valid {dateLabel(draft.start)} – {dateLabel(draft.end)}.</p></>}
        {tab === 'Advanced' && <><h3>Advanced Settings</h3><p className="mw-help">Manage offer identifiers, stacking and promotional artwork.</p><Field label="External Offer ID (POS)"><input value={draft.externalId} onChange={event => update('externalId', event.target.value)} /></Field><div className="mw-form-row"><Field label="Promo Code"><input placeholder="Optional" value={draft.code} onChange={event => update('code', event.target.value.toUpperCase())} /></Field><Field label="Priority"><input type="number" min={0} step={1} value={draft.priority} onChange={event => update('priority', Number(event.target.value))} /></Field></div><div className="offer-advanced-toggle"><Toggle label="Allow offer stacking" checked={draft.stacking} onChange={() => update('stacking', !draft.stacking)} /><span>Allow with Other Offers</span></div><button type="button" className="mw-upload-box" onClick={() => imageRef.current?.click()}><Icon name="upload" size={26} /><strong>Upload Offer Image</strong><span>PNG, JPG, WebP (Max 2MB)</span></button>{draft.image && <button type="button" className="mw-button mw-outline" onClick={() => update('image', '')}>Use Default Artwork</button>}<input ref={imageRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => { uploadImage(event.target.files?.[0]); event.target.value = ''; }} /></>}
      </div></form><section className="mw-preview offer-preview" aria-label="Offer preview"><h3>Offer Preview</h3><OfferArt offer={draft} large /><div className="offer-preview-title"><h3>{draft.name || 'New Offer'}</h3><span className={`offer-status ${draft.active ? 'is-active' : ''}`}>{draft.active ? 'Active' : 'Inactive'}</span></div><p className="offer-preview-description">{draft.description || 'Your offer description will appear here.'}</p><dl><div><dt>Type:</dt><dd>{draft.type}</dd></div><div><dt>Value:</dt><dd>{offerValue(draft)}</dd></div><div><dt>Min Order:</dt><dd>${draft.minimum.toFixed(2)}</dd></div><div><dt>Max Discount:</dt><dd>{draft.maxDiscount ? `$${draft.maxDiscount.toFixed(2)}` : 'No Limit'}</dd></div><div><dt>Valid:</dt><dd>{dateLabel(draft.start)} – {dateLabel(draft.end)}</dd></div><div><dt>Usage Limit:</dt><dd>{draft.usage || 'Unlimited'}</dd></div></dl></section></div>
      <div className="mw-editor-actions offer-editor-actions"><button type="button" className="mw-button" onClick={() => { const original = offers.find(offer => offer.id === draft.id) || offers[0]; if (original) edit(original); else add(); setNotice('Changes cancelled.'); }}>Cancel</button><button className="mw-button mw-primary" type="submit" form="offer-form" disabled={saving}>{saving ? 'Saving…' : 'Save Offer'}</button></div>
    </section></div>
    {deleting && <div className="mw-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeDelete(); }}><section className="mw-modal" role="dialog" aria-modal="true" aria-labelledby="delete-offer-title" onKeyDown={dialogKeys}><h2 id="delete-offer-title">Delete offer?</h2><p>Remove “{deleting.name}” from this demo session?</p><div><button ref={cancelDeleteRef} className="mw-button" onClick={closeDelete}>Cancel</button><button className="mw-button mw-danger" onClick={remove}>Delete Offer</button></div></section></div>}
  </div></OfferErrors.Provider>;
}
