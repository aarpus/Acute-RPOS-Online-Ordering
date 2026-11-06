'use client';
import { getNoticeTone } from '../../lib/notices';
import { useLegacyCollection, useLegacyDraft, useLegacyMenu } from './legacy-menu-client';
import { blankLegacy, legacyRows, type LegacyRow } from '../../lib/menu-legacy-codec';
import { menuItemImage, readMenuItemImage } from '../../lib/menu-item-image';
import VariantImage from './VariantImage';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Icon, MenuNavigation, Toggle } from './MenuControls';

type Variant = { id: number; _dbId?: string; _itemId?: string; item: string; name: string; group: string; externalId: string; sku: string; price: number; compare: number; order: number; inventory: number; isDefault: boolean; available: boolean; image: string };
const itemImages: Record<string, string> = { 'Chicken Biryani': '/images/biryani.jpg', Pizza: '/images/chicken.jpg', Burger: '/images/wrap.jpg', 'French Fries': '/images/samosas.jpg', 'Masala Dosa': '/images/wrap-detail.jpg', 'Butter Chicken': '/images/chicken.jpg', 'Paneer Tikka': '/images/category-0.jpg', 'Mango Lassi': '/images/lassi.jpg' };
const itemNames = Object.keys(itemImages);
const groups = ['Portion', 'Size', 'Serving'];
const sameItem = (a: Variant, b: Variant) => a._itemId && b._itemId ? a._itemId === b._itemId : a.item === b.item;
const seedRows: [string, string, number, string, boolean, string][] = [
  ['Chicken Biryani', 'Half', 8.99, 'BIR-H', true, 'Portion'],
  ['Chicken Biryani', 'Full', 12.99, 'BIR-F', false, 'Portion'],
  ['Pizza', 'Small', 8.99, 'PZA-S', false, 'Size'],
  ['Pizza', 'Medium', 11.99, 'PZA-M', true, 'Size'],
  ['Pizza', 'Large', 14.99, 'PZA-L', false, 'Size'],
  ['Burger', 'Regular', 8.99, 'BRG-R', true, 'Size'],
  ['Burger', 'Large', 11.99, 'BRG-L', false, 'Size'],
  ['French Fries', 'Single', 4.99, 'FRY-S', true, 'Serving'],
  ['French Fries', 'Family', 8.99, 'FRY-F', false, 'Serving'],
  ['Masala Dosa', 'Regular', 9.99, 'DOS-R', true, 'Size'],
  ['Masala Dosa', 'Large', 12.99, 'DOS-L', false, 'Size'],
  ['Butter Chicken', 'Half', 9.99, 'BCH-H', true, 'Portion'],
  ['Butter Chicken', 'Full', 13.99, 'BCH-F', false, 'Portion'],
  ['Paneer Tikka', 'Regular', 11.99, 'PNR-R', true, 'Size'],
  ['Paneer Tikka', 'Large', 15.99, 'PNR-L', false, 'Size'],
  ['Mango Lassi', 'Small', 3.99, 'LAS-S', true, 'Size'],
  ['Mango Lassi', 'Large', 5.99, 'LAS-L', false, 'Size'],
  ['Chicken Biryani', 'Medium', 10.99, 'BIR-M', false, 'Portion'],
];
const sampleinitialVariants: Variant[] = seedRows.map(([item, name, price, sku, isDefault, group], index) => ({ id: index + 1, item, name, price, sku, isDefault, group, externalId: index === 0 ? 'VAR-HALF' : `VAR-${sku}`, compare: price + 2, order: seedRows.slice(0, index).filter(row => row[0] === item).length + 1, inventory: 50, available: true, image: itemImages[item] }));

export default function VariantsWorkspace({ hidden = false, onNavigate }: { hidden?: boolean; onNavigate: (section: string) => void }) {
  const menu = useLegacyMenu(); const canCreate = menu.canCreate('variants');
  const initialVariants = [blankLegacy('variants', sampleinitialVariants[0] as unknown as LegacyRow, menu.snapshot) as unknown as Variant];
  const databaseItems = legacyRows(menu.snapshot, 'items');
  const databaseCategories = legacyRows(menu.snapshot, 'categories').map(row => row.name as string);
  const itemNames = databaseItems.map(row => row.name as string);
  const itemImages = Object.fromEntries(databaseItems.map(row => [row.name, row.images[0]])) as Record<string,string>;

  const [variants, setVariants] = useLegacyCollection<Variant>('variants');
  const [draft, setDraft] = useLegacyDraft<Variant>('variants', initialVariants[0]);
  const [query, setQuery] = useState(''); const [itemFilter, setItemFilter] = useState('All Items');
  const [groupFilter, setGroupFilter] = useState('All Groups'); const [status, setStatus] = useState('All Status');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<number[]>([]); const [localNotice, setNotice] = useState(''); const notice = menu.error || (menu.loading ? 'Loading menu…' : localNotice);
  const [deleting, setDeleting] = useState<Variant | null>(null);
  const nameRef = useRef<HTMLInputElement>(null); const importRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null); const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const selectedItemId = draft._itemId || databaseItems.find(item => item.name === draft.item)?._dbId || '';
  const filtered = variants.filter(variant => `${variant.name} ${variant.item} ${variant.sku}`.toLowerCase().includes(query.trim().toLowerCase()) && (itemFilter === 'All Items' || variant.item === itemFilter) && (groupFilter === 'All Groups' || variant.group === groupFilter) && (status === 'All Status' || variant.available === (status === 'Active')));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allSelected = rows.length > 0 && rows.every(row => selected.includes(row.id));
  const someSelected = rows.some(row => selected.includes(row.id));
  const siblings = variants.filter(variant => sameItem(variant, draft)).sort((a, b) => a.order - b.order);
  const previewVariants = (siblings.some(variant => variant.id === draft.id) ? siblings.map(variant => variant.id === draft.id ? draft : variant) : [draft, ...siblings]).slice(0, 3);
  const update = <K extends keyof Variant>(key: K, value: Variant[K]) => setDraft(previous => ({ ...previous, [key]: value }));

  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected; }, [someSelected, allSelected]);
  useEffect(() => { if (deleting) cancelDeleteRef.current?.focus(); }, [deleting]);

  function edit(variant: Variant) { setDraft({ ...variant }); setNotice(''); }
  function add() {
    setDraft({ ...initialVariants[0], _dbId: undefined, _itemId: databaseItems[0]?._dbId, id: Date.now(), name: '', externalId: '', sku: '', price: 0, compare: 0, isDefault: false, order: Math.max(0, ...variants.filter(variant => variant.item === initialVariants[0].item).map(variant => variant.order)) + 1, inventory: 0 });
    setNotice(''); nameRef.current?.focus();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (imageUploading) return;
    if (!draft.name.trim() || !draft.item || !Number.isFinite(draft.price) || draft.price < 0 || !Number.isFinite(draft.compare) || draft.compare < 0 || !Number.isInteger(draft.order) || draft.order < 1 || !Number.isInteger(draft.inventory) || draft.inventory < 0) { setNotice('Enter a variant name, valid prices, a positive display order and a whole stock quantity.'); nameRef.current?.focus(); return; }
    if (variants.some(variant => variant.id !== draft.id && sameItem(variant, draft) && variant.name.toLowerCase() === draft.name.trim().toLowerCase())) { setNotice('This item already has a variant with that name.'); return; }
    const saved = { ...draft, _itemId: selectedItemId, name: draft.name.trim(), sku: draft.sku.trim(), externalId: draft.externalId.trim() };
    if (!await setVariants(previous => {
      const updated = previous.map(variant => variant.id === saved.id ? saved : saved.isDefault && sameItem(variant, saved) ? { ...variant, isDefault: false } : variant);
      return updated.some(variant => variant.id === saved.id) ? updated : [...updated, saved];
    })) return;
    setDraft(saved); setNotice('Variant saved. Saved to the database.');
  }
  async function uploadImage(file?: File) {
    if (!file || imageUploading) return;
    const draftId = draft.id;
    setImageUploading(true); setNotice(''); menu.clearError();
    try {
      const image = await readMenuItemImage(file, false);
      setDraft(previous => previous.id === draftId ? { ...previous, image } : previous);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Unable to read the variant image.'); }
    finally { setImageUploading(false); }
  }
  async function setDefault(variant: Variant) {
    if (!await setVariants(previous => previous.map(value => sameItem(value, variant) ? { ...value, isDefault: value.id === variant.id } : value))) return;
    if (sameItem(draft, variant)) update('isDefault', draft.id === variant.id);
  }
  async function toggleAvailable(variant: Variant) {
    if (!await setVariants(previous => previous.map(value => value.id === variant.id ? { ...value, available: !value.available } : value))) return;
    if (draft.id === variant.id) update('available', !variant.available);
  }
  function togglePageSelection() { setSelected(previous => allSelected ? previous.filter(id => !rows.some(row => row.id === id)) : [...new Set([...previous, ...rows.map(row => row.id)])]); }
  async function bulkAvailability(available: boolean) {
    if (!await setVariants(previous => previous.map(variant => selected.includes(variant.id) ? { ...variant, available } : variant))) return;
    if (selected.includes(draft.id)) update('available', available);
    setNotice(`${selected.length} variants marked ${available ? 'available' : 'unavailable'}.`); setSelected([]);
  }
  function closeDelete() { setDeleting(null); deleteTriggerRef.current?.focus(); }
  async function remove() {
    if (!deleting) return;
    const remaining = variants.filter(variant => variant.id !== deleting.id);
    if (!await setVariants(remaining)) return; setSelected(previous => previous.filter(id => id !== deleting.id));
    if (draft.id === deleting.id) { if (remaining[0]) edit(remaining[0]); else add(); }
    setDeleting(null); setNotice('Variant archived in the database.'); nameRef.current?.focus();
  }
  async function importVariants(file?: File) {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      const records = Array.isArray(data) ? data : data && typeof data === 'object' && 'variants' in data ? data.variants : null;
      if (!Array.isArray(records) || !records.length) throw new Error();
      const stamp = Date.now();
      const imported: Variant[] = records.map((record: unknown, index: number) => {
        if (!record || typeof record !== 'object' || !('name' in record) || typeof record.name !== 'string' || !record.name.trim() || !('item' in record) || typeof record.item !== 'string' || !itemNames.includes(record.item) || !('price' in record) || typeof record.price !== 'number' || !Number.isFinite(record.price) || record.price < 0) throw new Error();
        return { ...initialVariants[0], id: stamp + index, name: record.name.trim(), item: record.item, price: record.price, compare: record.price + 2, image: itemImages[record.item], sku: `IMP-${stamp}-${index + 1}`, externalId: `VAR-IMPORT-${stamp}-${index + 1}`, group: record.item === 'Chicken Biryani' || record.item === 'Butter Chicken' ? 'Portion' : record.item === 'French Fries' ? 'Serving' : 'Size', isDefault: false, order: Math.max(0, ...variants.filter(variant => variant.item === record.item).map(variant => variant.order)) + index + 1 };
      });
      const keys = [...variants, ...imported].map(variant => `${variant.item.toLowerCase()}:${variant.name.toLowerCase()}`);
      if (new Set(keys).size !== keys.length) { setNotice('Import contains duplicate variant names for the same item. Please use unique names.'); return; }
      if (!await setVariants(previous => [...previous, ...imported])) return; setNotice(`${imported.length} variants imported into this demo session.`);
    } catch { setNotice('Use a JSON array with name, item and numeric price fields. Item must match an existing menu item.'); }
  }

  return <div className="mw-workspace variant-workspace" hidden={hidden}>
    <div className="mw-page-heading"><div><h1>Menu Management</h1><p>Add, edit and organize your menu items, categories, variants, modifiers and more.</p></div><div className="mw-heading-actions">{false && <button className="mw-button mw-outline" disabled title="હજુ ઉપલબ્ધ નથી"><Icon name="upload" />Import POS JSON</button>}<button style={{ display: canCreate ? undefined : 'none' }} className="mw-button mw-primary" onClick={add}><Icon name="plus" />Add Variant</button></div></div>
    <input ref={importRef} type="file" hidden accept=".json,application/json" onChange={event => { void importVariants(event.target.files?.[0]); event.target.value = ''; }} />
    <MenuNavigation active="Variants" onChange={onNavigate} />
    {notice && <div className="mw-notice" data-notice-tone={menu.loading ? 'info' : getNoticeTone(notice, !!menu.error)} role={menu.error ? 'alert' : 'status'}>{notice}<button aria-label="Dismiss variant notification" onClick={() => { setNotice(''); menu.clearError(); }}>×</button></div>}
    <div className="mw-columns variant-columns">
      <section className="mw-panel variant-list" aria-labelledby="variants-heading"><h2 id="variants-heading">Variants ({variants.length})</h2>
        <div className="mw-search-row"><div className="mw-search"><Icon name="search" size={19} /><input aria-label="Search variants" placeholder="Search variants..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><button className="mw-icon-button" aria-label="Reset variant filters" title="Reset filters" onClick={() => { setQuery(''); setItemFilter('All Items'); setGroupFilter('All Groups'); setStatus('All Status'); setPage(1); }}><Icon name="filter" /></button></div>
        <div className="variant-filters"><select aria-label="Filter variants by item" value={itemFilter} onChange={event => { setItemFilter(event.target.value); setPage(1); }}><option>All Items</option>{itemNames.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Filter variants by group" value={groupFilter} onChange={event => { setGroupFilter(event.target.value); setPage(1); }}><option>All Groups</option>{groups.map(group => <option key={group}>{group}</option>)}</select><select aria-label="Filter variants by status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option>All Status</option><option>Active</option><option>Inactive</option></select></div>
        {selected.length > 0 && <div className="variant-selection"><span>{selected.length} selected</span><button onClick={() => bulkAvailability(true)}>Enable</button><button onClick={() => bulkAvailability(false)}>Disable</button><button onClick={() => setSelected([])}>Clear</button></div>}
        <div className="mw-table-scroll"><table className="mw-table variant-table"><thead><tr><th scope="col"><input ref={selectAllRef} type="checkbox" aria-label="Select all variants on this page" checked={allSelected} disabled={!rows.length} onChange={togglePageSelection} /></th>{['Image', 'Variant Name', 'Item Name', 'Price', 'SKU', 'Default', 'Status', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{rows.map(variant => <tr key={variant.id} className={selected.includes(variant.id) ? 'is-selected' : ''}>
          <td><input type="checkbox" aria-label={`Select ${variant.item} ${variant.name}`} checked={selected.includes(variant.id)} onChange={() => setSelected(previous => previous.includes(variant.id) ? previous.filter(id => id !== variant.id) : [...previous, variant.id])} /></td>
          <td><button className="mw-thumbnail" aria-label={`Edit ${variant.item} ${variant.name} image`} onClick={() => edit(variant)}><VariantImage src={variant.image} alt={`${variant.item} ${variant.name}`} /></button></td>
          <td><button className="mw-name" onClick={() => edit(variant)}>{variant.name}</button></td><td>{variant.item}</td><td>${variant.price.toFixed(2)}</td><td title={variant.sku}>{variant.sku || "-"}</td>
          <td><input className="variant-default-radio" type="radio" name={`variant-default-${variant._itemId || variant.item}`} aria-label={`Set ${variant.item} ${variant.name} as default`} checked={variant.isDefault} onChange={() => setDefault(variant)} /></td>
          <td><Toggle label={`${variant.item} ${variant.name} available`} checked={variant.available} onChange={() => toggleAvailable(variant)} /></td>
          <td><div className="mw-row-actions"><button aria-label={`Edit ${variant.item} ${variant.name}`} onClick={() => edit(variant)}><Icon name="edit" size={17} /></button><button className="mw-delete" aria-label={`Delete ${variant.item} ${variant.name}`} onClick={event => { deleteTriggerRef.current = event.currentTarget; setDeleting(variant); }}><Icon name="trash" size={17} /></button></div></td>
        </tr>)}</tbody></table>{!rows.length && <div className="mw-empty">No variants match your search and filters.</div>}</div>
        <div className="mw-pagination variant-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} variants</span><div><button aria-label="Previous variants page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: pages }, (_, index) => index + 1).filter(number => number === 1 || number === pages || Math.abs(number - currentPage) <= 1).map(number => <button key={number} className={number === currentPage ? 'is-active' : ''} aria-current={number === currentPage ? 'page' : undefined} aria-label={`Variants page ${number}`} onClick={() => setPage(number)}>{number}</button>)}<button aria-label="Next variants page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button><select aria-label="Variants per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={5}>5 / page</option><option value={20}>20 / page</option></select></div></div>
      </section>
      <section className="mw-panel variant-editor" style={{ display: canCreate || (draft as unknown as { _dbId?: string })._dbId ? undefined : 'none' }} aria-labelledby="variant-editor-heading"><h2 id="variant-editor-heading">Add / Edit Variant</h2>
        <div className="variant-editor-content"><form className="variant-form" onSubmit={save} noValidate>
          <div className="mw-form-row"><Field label="Item Name" required><select aria-label="Variant item" value={selectedItemId} disabled={Boolean(draft._dbId)} onChange={event => { const item = databaseItems.find(row => row._dbId === event.target.value); if (item) setDraft(previous => ({ ...previous, _itemId: item._dbId, item: item.name, image: item.images[0], group: "Size", isDefault: false })); }}><option value="" disabled>Select an item</option>{databaseItems.map(item => <option key={item._dbId} value={item._dbId}>{item.name}</option>)}</select></Field><Field label="Variant Name" required><input ref={nameRef} maxLength={100} value={draft.name} placeholder="Enter variant name" onChange={event => update('name', event.target.value)} /></Field></div>
          <div className="mw-form-row"><Field label="External Variant ID (POS)"><input value={draft.externalId} onChange={event => update('externalId', event.target.value)} /></Field><Field label="SKU"><input value={draft.sku} onChange={event => update('sku', event.target.value)} /></Field></div>
          <div className="mw-form-row variant-prices"><Field label="Price" required><input type="number" min={0} step="0.01" value={draft.price} onChange={event => update('price', Number(event.target.value))} /></Field><Field label="Compare Price"><input type="number" min={0} step="0.01" value={draft.compare} onChange={event => update('compare', Number(event.target.value))} /></Field></div>
          <div className="mw-form-row"><Field label="Display Order"><input type="number" min={1} step={1} value={draft.order} onChange={event => update('order', Number(event.target.value))} /></Field><Field label="Inventory Quantity"><input type="number" min={0} step={1} value={draft.inventory} onChange={event => update('inventory', Number(event.target.value))} /></Field></div>
          <div className="mw-form-row"><Field label="Variant Group"><select value={draft.group || "Size"} onChange={event => update("group", event.target.value)}>{groups.map(group => <option key={group}>{group}</option>)}</select></Field></div><div className="variant-image-controls"><button type="button" className="mw-button mw-outline" disabled={imageUploading} onClick={() => imageRef.current?.click()}><Icon name="upload" size={17} />{imageUploading ? "Reading image..." : "Add / Change Image"}</button><button type="button" className="mw-button" onClick={() => update("image", itemImages[draft.item] || "/images/category-0.jpg")}>Use Item Image</button><small>{menuItemImage.fileLabel}</small><input ref={imageRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => { void uploadImage(event.target.files?.[0]); event.target.value = ""; }} /></div><div className="variant-toggles"><div><Toggle checked={draft.isDefault} label="Set variant as default" onChange={() => update('isDefault', !draft.isDefault)} /><span>Set as Default</span></div><div><Toggle checked={draft.available} label="Variant available" onChange={() => update('available', !draft.available)} /><span>Available</span></div></div>
          <div className="mw-editor-actions variant-editor-actions"><button type="button" className="mw-button" onClick={() => { const original = variants.find(variant => variant.id === draft.id) || variants[0]; if (original) edit(original); else add(); setNotice('Changes cancelled.'); }}>Cancel</button><button type="submit" disabled={imageUploading} className="mw-button mw-primary">Save Variant</button></div>
        </form><section className="mw-preview variant-preview" aria-label="Variant preview"><h3>Variant Preview</h3><VariantImage className="variant-preview-image" src={draft.image} alt={`${draft.item} ${draft.name}`} /><div className="variant-preview-choices">{previewVariants.map(variant => <button key={variant.id} type="button" className={variant.id === draft.id ? 'is-active' : ''} aria-label={`Preview ${variant.item} ${variant.name}`} aria-pressed={variant.id === draft.id} onClick={() => edit(variant)}><VariantImage src={variant.image} alt="" /><span>{variant.name || 'New Variant'}</span></button>)}</div><div className="variant-preview-title"><h3>{draft.name || 'New Variant'}</h3><strong>${draft.price.toFixed(2)}</strong></div><dl className="variant-preview-details"><div><dt>Item:</dt><dd>{draft.item}</dd></div><div><dt>SKU:</dt><dd>{draft.sku || '—'}</dd></div><div><dt>Default:</dt><dd>{draft.isDefault ? 'Yes' : 'No'}</dd></div><div><dt>Available:</dt><dd>{draft.available ? 'Yes' : 'No'}</dd></div><div><dt>Inventory:</dt><dd>{draft.inventory}</dd></div><div><dt>Compare Price:</dt><dd>${draft.compare.toFixed(2)}</dd></div></dl></section></div>
      </section>
    </div>
    {deleting && <div className="mw-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeDelete(); }}><section className="mw-modal" role="dialog" aria-modal="true" aria-labelledby="delete-variant-title" onKeyDown={event => { if (event.key === 'Escape') closeDelete(); if (event.key === 'Tab') { const buttons = event.currentTarget.querySelectorAll('button'); const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }}><h2 id="delete-variant-title">Delete variant?</h2><p>Remove “{deleting.item} — {deleting.name}” from this demo session?</p><div><button ref={cancelDeleteRef} className="mw-button" onClick={closeDelete}>Cancel</button><button className="mw-button mw-danger" onClick={remove}>Delete Variant</button></div></section></div>}
  </div>;
}
