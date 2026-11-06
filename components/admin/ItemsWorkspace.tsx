'use client';
import { canViewMenuEditorTab } from '../../lib/menu-create-policy';
import { getNoticeTone } from '../../lib/notices';
import { menuItemImage, readMenuItemImage } from '../../lib/menu-item-image';
import { useLegacyCollection, useLegacyDraft, useLegacyMenu } from './legacy-menu-client';
import { blankLegacy, copyVariantTemplate, legacyRows, type LegacyRow } from '../../lib/menu-legacy-codec';
import VariantImage from './VariantImage';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Icon, MenuNavigation, Toggle } from './MenuControls';

const editorTabs = ['Basic Info', 'Variants / Sizes', 'Modifiers / Add-ons', 'Combo Options', 'Images', 'Inventory', 'Schedule', 'Pricing', 'SEO & Meta'];
const categoryOptions = ['Biryani', 'Dinner', 'Combos', 'Pizza', 'Burger', 'Sides', 'Breakfast', 'Beverages', 'Desserts', 'Starters', 'Breads'];
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type Variant = { id: number; _dbId?: string; _updatedAt?: string; name: string; price: number; enabled: boolean; image?: string; group?: string; compare?: number; isDefault?: boolean };
type Modifier = { _optionId?: string; _optionUpdatedAt?: string; name: string; price: number; selected: boolean };
type MenuItem = {
  id: number; _dbId?: string; name: string; externalId: string; sku: string; description: string; categories: string[];
  type: string; food: string; price: number; compare: number; tax: string; preparation: number;
  min: number; max: number; featured: boolean; visible: boolean; available: boolean; instructions: boolean;
  enabled: boolean; badge: string; images: string[]; variants: Variant[]; modifiers: Modifier[];
  comboItems: string[]; trackStock: boolean; stock: number; lowStock: number; days: string[];
  start: string; end: string; seoTitle: string; slug: string; metaDescription: string;
};

const itemNames = ['Chicken Biryani', 'Pizza Meal Combo', 'Paneer Pizza', 'Veg Burger', 'French Fries', 'Masala Dosa', 'Butter Chicken', 'Paneer Tikka', 'Chole Bhature', 'Gulab Jamun', 'Mutton Biryani', 'Veg Biryani', 'Chicken Tikka', 'Garlic Naan', 'Mango Lassi', 'Samosa', 'Dal Makhani', 'Palak Paneer', 'Margherita Pizza', 'Chicken Burger', 'Raita', 'Soft Drink', 'Tandoori Roti', 'Paneer Wrap', 'Rasmalai'];
const prices = [12.99, 19.99, 10.99, 8.99, 4.99, 9.99, 13.99, 11.99, 9.99, 4.99, 14.99, 10.99, 12.99, 3.99, 4.99, 3.99, 10.99, 11.99, 9.99, 10.99, 2.99, 1.99, 2.49, 8.99, 5.99];
const itemCategories = ['Biryani', 'Combos', 'Pizza', 'Burger', 'Sides', 'Breakfast', 'Dinner', 'Starters', 'Breakfast', 'Desserts', 'Biryani', 'Biryani', 'Starters', 'Breads', 'Beverages', 'Starters', 'Dinner', 'Dinner', 'Pizza', 'Burger', 'Sides', 'Beverages', 'Breads', 'Sides', 'Desserts'];
const itemImages = ['biryani.jpg', 'chicken.jpg', 'category-2.jpg', 'wrap.jpg', 'samosas.jpg', 'wrap-detail.jpg', 'chicken.jpg', 'category-0.jpg', 'bowl.jpg', 'category-9.jpg', 'biryani.jpg', 'bowl.jpg', 'chicken.jpg', 'naan.jpg', 'lassi.jpg', 'samosas.jpg', 'bowl.jpg', 'category-1.jpg', 'category-2.jpg', 'wrap.jpg', 'bowl.jpg', 'lassi.jpg', 'naan.jpg', 'wrap.jpg', 'category-9.jpg'];
function createItem(id: number, name: string, index = 0): MenuItem {
  const price = prices[index] ?? 0;
  return {
    id, name, externalId: `ITEM-${1001 + index}`, sku: index === 0 ? 'BIR-001' : `SKU-${String(index + 1).padStart(3, '0')}`,
    description: index === 0 ? 'Aromatic rice with chicken and spices.' : `Freshly prepared ${name.toLowerCase()} with authentic flavors.`,
    categories: index === 0 ? ['Biryani', 'Dinner'] : [itemCategories[index] || 'Dinner'], type: index === 1 ? 'Combo Item' : 'Regular Item', food: [0, 6, 10, 12, 19].includes(index) ? 'Non-Veg' : 'Veg',
    price, compare: price + 2, tax: 'Food Sales Tax (6%)', preparation: 25, min: 1, max: 10, featured: index === 0 || index === 1,
    visible: true, available: true, instructions: true, enabled: index !== 8, badge: index === 0 ? 'Bestseller' : index === 1 ? 'Featured' : '',
    images: [`/images/${itemImages[index] || 'biryani.jpg'}`, '/images/chicken.jpg', '/images/bowl.jpg'],
    variants: [{ id: 1, name: 'Regular', price, enabled: true }, { id: 2, name: 'Large', price: price + 4, enabled: true }],
    modifiers: [{ name: 'Extra Raita', price: 1.99, selected: true }, { name: 'Extra Chicken', price: 3.99, selected: false }, { name: 'Extra Spicy', price: 0, selected: true }],
    comboItems: index === 1 ? ['French Fries', 'Soft Drink'] : [], trackStock: true, stock: 50, lowStock: 10,
    days: [...weekdays], start: '10:00', end: '22:00', seoTitle: name, slug: name.toLowerCase().replaceAll(' ', '-'), metaDescription: '',
  };
}
const sampleinitialItems = itemNames.map((name, index) => createItem(index + 1, name, index));
const copyItem = (item: MenuItem): MenuItem => ({ ...item, categories: [...item.categories], images: [...item.images], days: [...item.days], variants: item.variants.map(variant => ({ ...variant })), modifiers: item.modifiers.map(modifier => ({ ...modifier })), comboItems: [...item.comboItems] });

function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={direction === 'left' ? 'm14 5-7 7 7 7' : 'm10 5 7 7-7 7'} /></svg>;
}

export default function ItemsWorkspace({ onNavigate, hidden = false }: { onNavigate: (section: string) => void; hidden?: boolean }) {
  const menu = useLegacyMenu(); const canCreate = menu.canCreate('items');
  const initialItems = [blankLegacy('items', sampleinitialItems[0] as unknown as LegacyRow, menu.snapshot) as unknown as MenuItem];
  const databaseItems = legacyRows(menu.snapshot, 'items');
  const databaseCategories = legacyRows(menu.snapshot, 'categories').map(row => row.name as string);
  const categoryOptions = databaseCategories;
  const taxOptions = legacyRows(menu.snapshot, 'tax-rules').map(row => row.name as string);

  const [items, setItems] = useLegacyCollection<MenuItem>('items');
  const [draft, setDraft] = useLegacyDraft<MenuItem>('items', initialItems[0]);
  const [selectedTab, setTab] = useState('Basic Info');
 const tab = canViewMenuEditorTab(selectedTab, menu.canCreate) ? selectedTab : 'Basic Info';
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('All Categories'); const [status, setStatus] = useState('All Status');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [localNotice, setNotice] = useState(''); const notice = menu.error || (menu.loading ? 'Loading menu…' : localNotice); const [categoryOpen, setCategoryOpen] = useState(false);
  const [deleting, setDeleting] = useState<MenuItem | null>(null); const [menuId, setMenuId] = useState<number | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [imageUploading, setImageUploading] = useState(false);
  const [variantTemplateId, setVariantTemplateId] = useState('');
  const [uploadingVariantId, setUploadingVariantId] = useState<number | null>(null);
  const variantImageRef = useRef<HTMLInputElement>(null);
  const variantImageTarget = useRef<{ itemId: number; variantId: number } | null>(null);
  const variantTemplates = legacyRows(menu.snapshot, 'variants');
  const nameRef = useRef<HTMLInputElement>(null); const uploadRef = useRef<HTMLInputElement>(null); const importRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null); const tableRef = useRef<HTMLDivElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null); const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const update = <K extends keyof MenuItem>(key: K, value: MenuItem[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const filtered = items.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()) && (category === 'All Categories' || item.categories.includes(category)) && (status === 'All Status' || item.enabled === (status === 'Active')));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!categoryRef.current?.contains(event.target as Node)) setCategoryOpen(false);
      if (!tableRef.current?.contains(event.target as Node)) setMenuId(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  useEffect(() => { if (deleting) cancelDeleteRef.current?.focus(); }, [deleting]);

  function edit(item: MenuItem) { setDraft(copyItem(item)); setVariantTemplateId(''); setImageIndex(0); setTab('Basic Info'); setCategoryOpen(false); setMenuId(null); setNotice(''); }
  function add() {
    const item = blankLegacy('items', sampleinitialItems[0] as unknown as LegacyRow, menu.snapshot) as unknown as MenuItem;
    setDraft({ ...item, id: Date.now() }); setVariantTemplateId('');
    setTab('Basic Info'); setImageIndex(0); setNotice(''); nameRef.current?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (imageUploading || uploadingVariantId !== null) return;
    if (!draft.name.trim() || !draft.categories.length || !Number.isFinite(draft.price) || draft.price < 0 || !Number.isInteger(draft.min) || !Number.isInteger(draft.max) || draft.min < 1 || draft.max < draft.min) {
      setTab('Basic Info'); setNotice('Enter an item name, select a category, and check the price and quantity limits.'); return;
    }
    if (draft.variants.some(variant => !variant.name.trim() || !Number.isFinite(variant.price) || variant.price < 0) || new Set(draft.variants.map(variant => variant.name.trim().toLowerCase())).size !== draft.variants.length) {
      setTab('Variants / Sizes'); setNotice('Enter unique variant names and valid non-negative prices.'); return;
    }
    if (draft.type === 'Combo Item' && !draft.comboItems.length) {
      setTab('Combo Options'); setNotice('Select at least one item for this combo.'); return;
    }
    if (draft.modifiers.some(modifier => !modifier.name.trim() || !Number.isFinite(modifier.price) || modifier.price < 0)) {
      setTab('Modifiers / Add-ons'); setNotice('Enter a name and a valid non-negative price for each add-on.'); return;
    }
    const saved = copyItem({ ...draft, name: draft.name.trim() });
    if (!await setItems(previous => previous.some(item => item.id === saved.id) ? previous.map(item => item.id === saved.id ? saved : item) : [...previous, saved])) return;
    setDraft(saved); setNotice('Item saved to the database.');
  }
  function addVariantTemplate() {
    const template = variantTemplates.find(variant => variant._dbId === variantTemplateId);
    if (!template) return;
    if (draft.variants.some(variant => variant._dbId === template._dbId || variant.name.trim().toLowerCase() === template.name.trim().toLowerCase())) {
      setNotice('This item already has that variant name. Edit its existing row below.'); return;
    }
    const variant = template._itemId === draft._dbId
      ? { ...template, enabled: template.available }
      : copyVariantTemplate(template, Date.now());
    update('variants', [...draft.variants, variant as Variant]);
    setVariantTemplateId(''); setNotice('Variant added to this item. Click Save Item to keep it.');
  }
  function addNewVariant() {
    update('variants', [...draft.variants, { id: Date.now(), name: '', price: draft.price, enabled: true, image: draft.images[0], group: 'Size', isDefault: false }]);
    setNotice('Enter the new size below. It will be created only for this item.');
  }
  async function uploadVariantImage(file?: File) {
    const target = variantImageTarget.current;
    if (!file || !target || uploadingVariantId !== null) return;
    setUploadingVariantId(target.variantId); setNotice(''); menu.clearError();
    try {
      const image = await readMenuItemImage(file, false);
      setDraft(previous => previous.id === target.itemId ? { ...previous, variants: previous.variants.map(variant => variant.id === target.variantId ? { ...variant, image } : variant) } : previous);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Unable to read the variant image.'); }
    finally { setUploadingVariantId(null); }
  }
  async function toggleStatus(item: MenuItem) {
    if (!await setItems(previous => previous.map(value => value.id === item.id ? { ...value, enabled: !value.enabled } : value))) return;
    if (draft.id === item.id) update('enabled', !item.enabled);
  }
  async function duplicate(item: MenuItem) {
    const copy = copyItem({ ...item, id: Date.now(), name: `${item.name} (Copy)`, sku: `${item.sku}-COPY`, externalId: `${item.externalId}-COPY` });
    if (!await setItems(previous => [...previous, copy])) return; edit(copy); setNotice('Item duplicated.');
  }
  async function upload(file?: File) {
    if (!file || imageUploading) return;
    setImageUploading(true); setNotice(''); menu.clearError();
    try {
      const source = await readMenuItemImage(file);
      setDraft(previous => previous.id === draft.id ? { ...previous, images: [...previous.images, source] } : previous);
      setImageIndex(draft.images.length);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Unable to read this image. Choose another file.');
    } finally { setImageUploading(false); }
  }
  function removeImage(index: number) {
    setDraft(previous => ({ ...previous, images: previous.images.filter((_, image) => image !== index) }));
    setImageIndex(current => Math.max(0, current > index ? current - 1 : Math.min(current, draft.images.length - 2)));
    setNotice('Image removed. Click Save Item to keep this change.');
  }
  async function importItems(file?: File) {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      const records = Array.isArray(data) ? data : data && typeof data === 'object' && 'items' in data ? data.items : null;
      if (!Array.isArray(records) || !records.length) throw new Error();
      const imported = records.map((record: unknown, index: number) => {
        if (!record || typeof record !== 'object' || !('name' in record) || typeof record.name !== 'string' || !record.name.trim() || !('price' in record) || typeof record.price !== 'number' || !Number.isFinite(record.price) || record.price < 0) throw new Error();
        return { ...createItem(Date.now() + index, record.name.trim()), price: record.price, externalId: `IMPORT-${Date.now()}-${index + 1}`, sku: `IMP-${index + 1}`, badge: '', featured: false };
      });
      if (!await setItems(previous => [...previous, ...imported])) return; setNotice(`${imported.length} items imported into this demo session.`);
    } catch { setNotice('Use a JSON array of items with a name and numeric price, or an object with an items array.'); }
  }
  function closeDelete() { setDeleting(null); deleteTriggerRef.current?.focus(); }
  async function removeItem() {
    if (!deleting) return;
    const remaining = items.filter(item => item.id !== deleting.id);
    if (!await setItems(remaining)) return;
    if (draft.id === deleting.id) { if (remaining[0]) edit(remaining[0]); else add(); }
    setDeleting(null); setNotice('Item archived in the database.'); nameRef.current?.focus();
  }
  const priceFields = <div className="mw-form-row"><Field label="Base Price" required><input type="number" min={0} step="0.01" value={draft.price} onChange={event => update('price', Number(event.target.value))} /></Field><Field label="Compare Price"><input type="number" min={0} step="0.01" value={draft.compare} onChange={event => update('compare', Number(event.target.value))} /></Field></div>;

  return <div className="mw-workspace item-workspace" hidden={hidden}>
    <div className="mw-page-heading"><div><h1>Menu Management</h1><p>Add, edit and organize your menu items, categories, variants, modifiers and more.</p></div><div className="mw-heading-actions">{false && <button className="mw-button mw-outline" disabled title="હજુ ઉપલબ્ધ નથી"><Icon name="upload" />Import POS JSON</button>}<button style={{ display: canCreate ? undefined : 'none' }} className="mw-button mw-primary" onClick={add}><Icon name="plus" />Add Menu Item</button></div></div>
    <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={event => { void importItems(event.target.files?.[0]); event.target.value = ''; }} />
    <MenuNavigation active="Items" onChange={onNavigate} />
    {notice && <div className="mw-notice" data-notice-tone={menu.loading ? 'info' : getNoticeTone(notice, !!menu.error)} role={menu.error ? 'alert' : 'status'}>{notice}<button aria-label="Dismiss notification" onClick={() => { setNotice(''); menu.clearError(); }}>×</button></div>}
    <div className="mw-columns item-columns">
      <section className="mw-panel item-list" aria-labelledby="menu-items-heading">
        <h2 id="menu-items-heading">Menu Items ({items.length})</h2>
        <div className="mw-search-row"><div className="mw-search"><Icon name="search" size={18} /><input aria-label="Search menu items" placeholder="Search menu items..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><button className="mw-icon-button" aria-label="Reset item filters" title="Reset filters" onClick={() => { setQuery(''); setCategory('All Categories'); setStatus('All Status'); setPage(1); }}><Icon name="filter" size={18} /></button></div>
        <div className="mw-filters"><select aria-label="Filter items by category" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option>All Categories</option>{categoryOptions.map(name => <option key={name}>{name}</option>)}</select><select aria-label="Filter items by status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option>All Status</option><option>Active</option><option>Inactive</option></select></div>
        <div className="mw-table-scroll" ref={tableRef}><table className="mw-table item-table"><thead><tr>{['Image', 'Item Name', 'Category', 'Price', 'Status', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{rows.map(item => <tr key={item.id}>
          <td><button className="mw-thumbnail" aria-label={`Edit ${item.name} image`} onClick={() => edit(item)}><img src={item.images[0]} alt={item.name} /></button></td><td><button className="mw-name" onClick={() => edit(item)}>{item.name}</button></td><td>{item.badge && <span className={`item-badge ${item.badge === 'Featured' ? 'is-featured' : ''}`}>{item.badge}</span>}</td><td>${item.price.toFixed(2)}</td><td><Toggle checked={item.enabled} label={`${item.name} active`} onChange={() => toggleStatus(item)} /></td>
          <td><div className="mw-row-actions item-row-actions"><button aria-label={`Edit ${item.name}`} onClick={() => edit(item)}><Icon name="edit" size={16} /></button><button style={{ display: canCreate ? undefined : 'none' }} className="item-copy" aria-label={`Duplicate ${item.name}`} onClick={() => duplicate(item)}><Icon name="copy" size={16} /></button><button className="mw-delete" aria-label={`Delete ${item.name}`} onClick={event => { deleteTriggerRef.current = event.currentTarget; setDeleting(item); }}><Icon name="trash" size={16} /></button><div className="item-more-wrap"><button aria-label={`More actions for ${item.name}`} aria-expanded={menuId === item.id} onClick={() => setMenuId(menuId === item.id ? null : item.id)}><span aria-hidden="true">⋮</span></button>{menuId === item.id && <div className="item-more-menu"><button onClick={() => { edit(item); setTab('Inventory'); }}>Manage inventory</button><button onClick={() => { edit(item); setTab('Schedule'); }}>Edit schedule</button><button onClick={() => { edit(item); setTab('SEO & Meta'); }}>Edit SEO</button></div>}</div></div></td>
        </tr>)}</tbody></table>{!rows.length && <div className="mw-empty">No items match your search and filters.</div>}</div>
        <div className="mw-pagination item-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} items</span><div><button aria-label="Previous items page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: pages }, (_, index) => index + 1).filter(number => number === 1 || number === pages || Math.abs(number - currentPage) <= 1).map(number => <button key={number} className={number === currentPage ? 'is-active' : ''} aria-current={number === currentPage ? 'page' : undefined} aria-label={`Items page ${number}`} onClick={() => setPage(number)}>{number}</button>)}<button aria-label="Next items page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button><select aria-label="Items per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={5}>5 / page</option><option value={25}>25 / page</option></select></div></div>
      </section>
      <section className="mw-panel item-editor" style={{ display: canCreate || (draft as unknown as { _dbId?: string })._dbId ? undefined : 'none' }} aria-labelledby="item-editor-heading">
        <h2 id="item-editor-heading">Add / Edit Menu Item</h2>
        <div className="mw-editor-tabs item-tabs" role="tablist" aria-label="Menu item settings">{editorTabs.filter(name => canViewMenuEditorTab(name, menu.canCreate)).map((name) => <button type="button" key={name} id={`item-tab-${editorTabs.indexOf(name)}`} role="tab" aria-selected={tab === name} aria-controls="item-editor-panel" className={tab === name ? 'is-active' : ''} onClick={() => { setTab(name); setCategoryOpen(false); }}>{name}</button>)}</div>
        <div className="item-editor-content">
          <form className="item-form" id="menu-item-form" onSubmit={save} noValidate>
            <div className="item-tab-panel" id="item-editor-panel" role="tabpanel" aria-labelledby={`item-tab-${editorTabs.indexOf(tab)}`}>
              {tab === 'Basic Info' && <>
                <div className="item-identity"><Field label="Item Name" required><input ref={nameRef} maxLength={100} value={draft.name} placeholder="Enter item name" onChange={event => update('name', event.target.value)} /></Field><Field label="External Item ID (POS)"><input value={draft.externalId} onChange={event => update('externalId', event.target.value)} /></Field><Field label="SKU"><input value={draft.sku} onChange={event => update('sku', event.target.value)} /></Field></div>
                <Field label="Description"><textarea maxLength={500} value={draft.description} onChange={event => update('description', event.target.value)} /><small>{draft.description.length}/500</small></Field>
                <div className="item-category-field" ref={categoryRef}><span id="item-category-label">Category <b>*</b></span><div className="item-category-select"><div className="item-selected-categories">{draft.categories.map(name => <span className="item-category-chip" key={name}>{name}<button type="button" aria-label={`Remove ${name} category`} onClick={() => update('categories', draft.categories.filter(category => category !== name))}>×</button></span>)}</div><button type="button" className="item-category-trigger" aria-label="Choose item categories" aria-expanded={categoryOpen} aria-controls="item-category-options" onClick={() => setCategoryOpen(!categoryOpen)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></div>{categoryOpen && <div className="item-category-options" id="item-category-options" role="group" aria-labelledby="item-category-label" onKeyDown={event => { if (event.key === 'Escape') setCategoryOpen(false); }}>{categoryOptions.map(name => <label key={name}><input type="checkbox" checked={draft.categories.includes(name)} onChange={() => update('categories', draft.categories.includes(name) ? draft.categories.filter(category => category !== name) : [...draft.categories, name])} />{name}</label>)}</div>}</div>
                <div className="mw-form-row item-types"><fieldset><legend>Item Type</legend><div className="mw-radio-row">{['Regular Item', 'Combo Item'].map(value => <label key={value}><input type="radio" name="item-type" checked={draft.type === value} onChange={() => update('type', value)} />{value}</label>)}</div></fieldset><fieldset><legend>Food Type</legend><div className="mw-radio-row">{['Veg', 'Non-Veg'].map(value => <label key={value}><input type="radio" name="item-food-type" checked={draft.food === value} onChange={() => update('food', value)} />{value}</label>)}</div></fieldset></div>
                {priceFields}
                <div className="mw-form-row"><Field label="Tax Rule"><select value={draft.tax} onChange={event => update('tax', event.target.value)}><option value="">No Tax</option>{taxOptions.map(name => <option key={name}>{name}</option>)}</select></Field><Field label="Preparation Time (mins)"><input type="number" min={0} value={draft.preparation} onChange={event => update('preparation', Math.max(0, Number(event.target.value)))} /></Field></div>
                <div className="item-quantity-fields"><Field label="Minimum Qty"><input type="number" min={1} value={draft.min} onChange={event => update('min', Number(event.target.value))} /></Field><Field label="Maximum Qty"><input type="number" min={draft.min} value={draft.max} onChange={event => update('max', Number(event.target.value))} /></Field></div>
                <div className="mw-option-grid item-options">{([['featured', 'Featured Item'], ['visible', 'Visible on Website'], ['available', 'Available for Order'], ['instructions', 'Allow Special Instructions']] as const).map(([key, label]) => <div className="item-option" key={key}><Toggle checked={draft[key]} label={label} onChange={() => update(key, !draft[key])} /><span>{label}</span></div>)}</div>
              </>}
              {tab === 'Variants / Sizes' && <><h3>Variants / Sizes</h3><p className="mw-help">Choose an existing size as a template or create a new one for this item. Changes are saved with Save Item.</p><div className="item-variant-picker"><label><span>Existing variant / size</span><select aria-label="Existing variant or size" value={variantTemplateId} onChange={event => setVariantTemplateId(event.target.value)}><option value="">Select a variant / size</option>{variantTemplates.map(variant => <option key={variant._dbId} value={variant._dbId}>{variant.name} - {variant.item} (${Number(variant.price).toFixed(2)})</option>)}</select></label><button type="button" className="mw-button mw-outline" disabled={!variantTemplateId} style={{ display: menu.canCreate('variants') ? undefined : 'none' }} onClick={addVariantTemplate}>Add Selected</button><button type="button" className="mw-button mw-outline" style={{ display: menu.canCreate('variants') ? undefined : 'none' }} onClick={addNewVariant}><Icon name="plus" size={17} />Create New Size</button></div><div className="item-settings-table item-variant-table"><div className="item-settings-head"><span>Image</span><span>Variant Name</span><span>Price</span><span>Active</span><span /></div>{draft.variants.map((variant, index) => <div className="item-settings-row" key={variant.id}><button type="button" className="item-variant-image" disabled={uploadingVariantId !== null} aria-label={`Change ${variant.name || 'new variant'} image`} onClick={() => { variantImageTarget.current = { itemId: draft.id, variantId: variant.id }; variantImageRef.current?.click(); }}><VariantImage src={variant.image || draft.images[0]} alt={variant.name || 'New variant'} /><span>{uploadingVariantId === variant.id ? '...' : 'Edit'}</span></button><input aria-label={`Variant ${index + 1} name`} placeholder="e.g. Small or Large" value={variant.name} onChange={event => update('variants', draft.variants.map(value => value.id === variant.id ? { ...value, name: event.target.value } : value))} /><input aria-label={`${variant.name} price`} type="number" min={0} step="0.01" value={variant.price} onChange={event => update('variants', draft.variants.map(value => value.id === variant.id ? { ...value, price: Math.max(0, Number(event.target.value)) } : value))} /><Toggle label={`${variant.name} variant active`} checked={variant.enabled} onChange={() => update('variants', draft.variants.map(value => value.id === variant.id ? { ...value, enabled: !value.enabled } : value))} /><button type="button" className="mw-delete" aria-label={`Remove ${variant.name} variant`} onClick={() => update('variants', draft.variants.filter(value => value.id !== variant.id))}><Icon name="trash" size={17} /></button></div>)}</div>{!draft.variants.length && <p className="mw-help">No sizes added yet. Choose a template above or create a new size.</p>}<small className="mw-help">Click a variant image to add or change it. {menuItemImage.fileLabel}</small></>}
              {tab === 'Modifiers / Add-ons' && <>
                <h3>Modifiers / Add-ons</h3>
                <p className="mw-help">Existing modifiers are listed below. Turn on the add-ons you want to offer with this item, then click Save Item. Changes to shared add-on names and prices apply wherever they are used.</p>
                <div className="item-settings-table">
                  <div className="item-settings-head"><span>Modifier Name</span><span>Price</span><span>Active</span><span /></div>
                  {draft.modifiers.map((modifier, index) => <div className="item-settings-row" key={modifier._optionId || index}>
                    <input aria-label={`Modifier ${index + 1} name`} maxLength={150} value={modifier.name} onChange={event => update('modifiers', draft.modifiers.map((value, i) => i === index ? { ...value, name: event.target.value } : value))} />
                    <input aria-label={`${modifier.name || 'Modifier'} price`} type="number" min={0} step="0.01" value={modifier.price} onChange={event => update('modifiers', draft.modifiers.map((value, i) => i === index ? { ...value, price: Number(event.target.value) } : value))} />
                    <Toggle label={`${modifier.name || 'Modifier'} add-on active`} checked={modifier.selected} onChange={() => update('modifiers', draft.modifiers.map((value, i) => i === index ? { ...value, selected: !value.selected } : value))} />
                    <button type="button" className="mw-delete" aria-label={`Remove ${modifier.name || 'modifier'} from item`} onClick={() => update('modifiers', draft.modifiers.filter((_, i) => i !== index))}><Icon name="trash" size={17} /></button>
                  </div>)}
                </div>
                {!draft.modifiers.length && <p className="mw-help">No existing modifiers are available. Create a modifier group or add a new modifier below.</p>}
                <button style={{ display: menu.canCreate('modifier-options') && menu.canCreate('modifier-groups') && menu.canCreate('modifier-links') ? undefined : 'none' }} type="button" className="mw-button mw-outline" onClick={() => update('modifiers', [...draft.modifiers, { name: '', price: 0, selected: true }])}><Icon name="plus" size={17} />Add Modifier</button>
              </>}
              {tab === 'Combo Options' && <><h3>Combo Options</h3><p className="mw-help">Choose the sides and drinks included with a combo item.</p><Field label="Item Type"><select value={draft.type} onChange={event => update('type', event.target.value)}><option>Regular Item</option><option>Combo Item</option></select></Field>{databaseItems.filter(item => item.id !== draft.id && item.type !== 'Combo Item').map(item => item.name as string).map(name => <label className="item-combo-choice" key={name}><input type="checkbox" checked={draft.comboItems.includes(name)} onChange={() => update('comboItems', draft.comboItems.includes(name) ? draft.comboItems.filter(value => value !== name) : [...draft.comboItems, name])} /><span>{name}</span><span>Included</span></label>)}</>}
              {tab === 'Images' && <><h3>Item Images</h3><p className="mw-help">The first image is the main photo. After deleting images, click Save Item to keep your changes.</p><div className="mw-gallery item-gallery">{draft.images.map((src, index) => <div key={`${src}-${index}`}><button type="button" aria-label={`Preview item image ${index + 1}`} className={imageIndex === index ? 'is-selected' : ''} onClick={() => setImageIndex(index)}><img src={src} alt={`Item photo ${index + 1}`} /></button><button type="button" className="item-make-main" disabled={index === 0} onClick={() => { update('images', [src, ...draft.images.filter((_, i) => i !== index)]); setImageIndex(0); }}>{index === 0 ? 'Main Image' : 'Make Main'}</button><button type="button" data-item-image-remove aria-label={`Delete item image ${index + 1}`} onClick={() => removeImage(index)}><Icon name="trash" size={14} />Delete Image</button></div>)}</div><button style={{ display: menu.canCreate('images') ? undefined : 'none' }} type="button" className="mw-upload-box" disabled={imageUploading} onClick={() => uploadRef.current?.click()}><Icon name="upload" size={28} /><strong>{imageUploading ? 'Checking image…' : 'Upload an item image'}</strong><span>{menuItemImage.sizeLabel}</span><span>{menuItemImage.fileLabel}</span></button></>}
              {tab === 'Inventory' && <><h3>Inventory Settings</h3><p className="mw-help">Manage stock and availability for this menu item.</p><Field label="SKU"><input value={draft.sku} onChange={event => update('sku', event.target.value)} /></Field><div className="item-option"><Toggle checked={draft.trackStock} label="Track inventory" onChange={() => update('trackStock', !draft.trackStock)} /><span>Track Inventory</span></div><div className="mw-form-row"><Field label="Stock Quantity"><input type="number" min={0} disabled={!draft.trackStock} value={draft.stock} onChange={event => update('stock', Math.max(0, Number(event.target.value)))} /></Field><Field label="Low Stock Alert"><input type="number" min={0} disabled={!draft.trackStock} value={draft.lowStock} onChange={event => update('lowStock', Math.max(0, Number(event.target.value)))} /></Field></div><div className="item-option"><Toggle checked={draft.enabled} label="Item status active" onChange={() => update('enabled', !draft.enabled)} /><span>Active</span></div></>}
              {tab === 'Schedule' && <><h3>Availability Schedule</h3><p className="mw-help">Set the days and times this item is available to order.</p><div className="mw-field"><span>Available Days</span><div className="mw-days">{weekdays.map(day => <button type="button" key={day} className={draft.days.includes(day) ? 'is-active' : ''} onClick={() => update('days', draft.days.includes(day) ? draft.days.filter(value => value !== day) : [...draft.days, day])}>{day}</button>)}</div></div><div className="mw-form-row"><Field label="Start Time"><input type="time" value={draft.start} onChange={event => update('start', event.target.value)} /></Field><Field label="End Time"><input type="time" value={draft.end} onChange={event => update('end', event.target.value)} /></Field></div></>}
              {tab === 'Pricing' && <><h3>Item Pricing</h3><p className="mw-help">Manage the base price, compare price and applicable tax.</p>{priceFields}<Field label="Tax Rule"><select value={draft.tax} onChange={event => update('tax', event.target.value)}><option value="">No Tax</option>{taxOptions.map(name => <option key={name}>{name}</option>)}</select></Field><div className="mw-price-summary"><span>Selling price<strong>${draft.price.toFixed(2)}</strong></span><span>Compare price<strong>${draft.compare.toFixed(2)}</strong></span><span>Customer saves<strong>${Math.max(0, draft.compare - draft.price).toFixed(2)}</strong></span></div><Field label="Item Badge"><select value={draft.badge} onChange={event => update('badge', event.target.value)}><option value="">No Badge</option><option>Bestseller</option><option>Featured</option><option>New</option></select></Field></>}
              {tab === 'SEO & Meta' && <><h3>SEO & Meta</h3><p className="mw-help">Customize how your item appears in search results.</p><Field label="SEO Title"><input maxLength={60} value={draft.seoTitle} onChange={event => update('seoTitle', event.target.value)} /></Field><Field label="URL Slug"><input value={draft.slug} onChange={event => update('slug', event.target.value)} /></Field><Field label="Meta Description"><textarea maxLength={160} value={draft.metaDescription} onChange={event => update('metaDescription', event.target.value)} /><small>{draft.metaDescription.length}/160</small></Field><div className="mw-seo-preview"><span>yourrestaurant.com/menu/{draft.slug}</span><h3>{draft.seoTitle || draft.name}</h3><p>{draft.metaDescription || draft.description}</p></div></>}
            </div>
          </form>
          <section className="mw-preview item-preview" aria-label="Item preview"><h3>Item Preview</h3><div className="item-preview-photo"><img src={draft.images[imageIndex] || draft.images[0] || '/images/category-0.jpg'} alt={draft.name || 'Menu item preview'} /><button type="button" aria-label="Previous item image" disabled={draft.images.length < 2} onClick={() => setImageIndex((imageIndex - 1 + draft.images.length) % draft.images.length)}><Arrow direction="left" /></button><button type="button" aria-label="Next item image" disabled={draft.images.length < 2} onClick={() => setImageIndex((imageIndex + 1) % draft.images.length)}><Arrow direction="right" /></button></div><div className="mw-thumbnails item-thumbnails">{draft.images.slice(0, 3).map((src, index) => <button type="button" key={index} aria-label={`View image ${index + 1}`} className={imageIndex === index ? 'is-selected' : ''} onClick={() => setImageIndex(index)}><img src={src} alt="" /></button>)}<button style={{ display: menu.canCreate('images') ? undefined : 'none' }} type="button" className="mw-add-image" title={menuItemImage.sizeLabel + ' · ' + menuItemImage.fileLabel} onClick={() => uploadRef.current?.click()}><Icon name="plus" /><span>Add Image</span></button></div><div className="item-preview-title"><h3>{draft.name || 'New Menu Item'}</h3><strong>${draft.price.toFixed(2)}</strong></div>{draft.badge && <span className={`item-badge item-preview-badge ${draft.badge === 'Featured' ? 'is-featured' : ''}`}>{draft.badge}</span>}<p className="item-preview-description">{draft.description || 'Your item description will appear here.'}</p><div className="item-preview-details"><h4>Categories:</h4><div className="item-preview-categories">{draft.categories.length ? draft.categories.map(name => <span className="item-category-chip" key={name}>{name}</span>) : <span className="mw-muted">Select a category</span>}</div><p><strong>Type:</strong> {draft.type}</p><p><strong>Food Type:</strong> {draft.food} <span className={`item-food-mark ${draft.food === 'Veg' ? 'is-veg' : ''}`} aria-hidden="true">▣</span></p><p className="item-preparation"><Icon name="Schedules" size={18} />Preparation Time: {draft.preparation} mins</p></div></section>
        </div>
        <input ref={variantImageRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => { void uploadVariantImage(event.target.files?.[0]); event.target.value = ""; }} /><input ref={uploadRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} />
        <div className="mw-editor-actions item-editor-actions"><button type="button" className="mw-button" onClick={() => { edit(items.find(item => item.id === draft.id) || items[0] || initialItems[0]); setNotice('Changes cancelled.'); }}>Cancel</button><button type="submit" form="menu-item-form" disabled={imageUploading || uploadingVariantId !== null} className="mw-button mw-primary">Save Item</button></div>
      </section>
    </div>
    {deleting && <div className="mw-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeDelete(); }}><section className="mw-modal" role="dialog" aria-modal="true" aria-labelledby="delete-item-heading" onKeyDown={event => { if (event.key === 'Escape') closeDelete(); if (event.key === 'Tab') { const buttons = event.currentTarget.querySelectorAll('button'); const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }}><h2 id="delete-item-heading">Delete menu item?</h2><p>Remove “{deleting.name}” from the menu? This archives the item and its settings in the database.</p>{menu.error && <p role="alert">{menu.error}</p>}<div><button ref={cancelDeleteRef} className="mw-button" onClick={closeDelete}>Cancel</button><button className="mw-button mw-danger" onClick={removeItem}>Delete Item</button></div></section></div>}
  </div>;
}
