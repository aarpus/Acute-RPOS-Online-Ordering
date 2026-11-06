'use client';
import { getNoticeTone } from '../../lib/notices';
import { useLegacyCollection, useLegacyDraft, useLegacyMenu } from './legacy-menu-client';
import { blankLegacy, legacyRows, type LegacyRow } from '../../lib/menu-legacy-codec';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Field, Icon, MenuNavigation, Toggle } from './MenuControls';
import { inventoryStatus, type StockStatus } from '../../lib/admin-inventory';

type History = { id: number; date: string; type: string; quantity: number; stock: number };
type InventoryItem = { id: number; name: string; sku: string; category: string; unit: string; stock: number; minimum: number; reorder: number; cost: string; email: string; tracked: boolean; alert: boolean; negative: boolean; active: boolean; image: string; history: History[] };
const categories = ['Biryani', 'Dinner', 'Breakfast', 'Sides', 'Pizza', 'Beverages', 'Breads', 'Burger', 'Starters', 'Desserts'];
const units = ['Plate', 'Can', 'Bottle', 'Piece', 'Cup', 'Portion', 'Kg'];
const seedRows: [string, string, string, number, number, string, string][] = [
  ['Chicken Biryani', 'BIR-001', 'Biryani', 50, 10, 'Plate', 'biryani.jpg'],
  ['Mutton Biryani', 'BIR-002', 'Biryani', 8, 10, 'Plate', 'biryani.jpg'],
  ['Paneer Butter Masala', 'PBN-001', 'Dinner', 25, 10, 'Plate', 'category-2.jpg'],
  ['Masala Dosa', 'DOS-001', 'Breakfast', 0, 5, 'Plate', 'wrap-detail.jpg'],
  ['French Fries', 'FRY-001', 'Sides', 100, 20, 'Plate', 'samosas.jpg'],
  ['Chicken Pizza', 'PZA-001', 'Pizza', 12, 10, 'Plate', 'chicken.jpg'],
  ['Veg Pizza', 'PZA-002', 'Pizza', 6, 10, 'Plate', 'category-2.jpg'],
  ['Coke (Can)', 'DRK-001', 'Beverages', 0, 20, 'Can', 'lassi.jpg'],
  ['Water Bottle', 'DRK-002', 'Beverages', 45, 10, 'Bottle', 'lassi.jpg'],
  ['Garlic Naan', 'BRD-001', 'Breads', 15, 10, 'Piece', 'naan.jpg'],
  ['Veg Burger', 'BRG-001', 'Burger', 30, 10, 'Piece', 'wrap.jpg'],
  ['Chicken Burger', 'BRG-002', 'Burger', 22, 10, 'Piece', 'wrap.jpg'],
  ['Butter Chicken', 'CHK-001', 'Dinner', 18, 10, 'Plate', 'chicken.jpg'],
  ['Paneer Tikka', 'PNR-001', 'Starters', 14, 8, 'Plate', 'category-0.jpg'],
  ['Chole Bhature', 'CHL-001', 'Breakfast', 9, 10, 'Plate', 'bowl.jpg'],
  ['Gulab Jamun', 'DES-001', 'Desserts', 40, 15, 'Piece', 'category-9.jpg'],
  ['Veg Biryani', 'BIR-003', 'Biryani', 24, 10, 'Plate', 'bowl.jpg'],
  ['Mango Lassi', 'DRK-003', 'Beverages', 16, 10, 'Cup', 'lassi.jpg'],
  ['Samosa', 'STR-001', 'Starters', 60, 20, 'Piece', 'samosas.jpg'],
  ['Dal Makhani', 'DAL-001', 'Dinner', 20, 10, 'Plate', 'bowl.jpg'],
  ['Palak Paneer', 'PNR-002', 'Dinner', 7, 10, 'Plate', 'category-1.jpg'],
  ['Plain Naan', 'BRD-002', 'Breads', 35, 10, 'Piece', 'naan.jpg'],
  ['Tandoori Roti', 'BRD-003', 'Breads', 0, 10, 'Piece', 'naan.jpg'],
  ['Paneer Wrap', 'WRP-001', 'Sides', 28, 10, 'Piece', 'wrap.jpg'],
];
const catalog = [...seedRows.map(([name, sku, category, , minimum, unit, image]) => ({ name, sku, category, minimum, unit, image: `/images/${image}` })), { name: 'Raita', sku: 'RAI-001', category: 'Sides', minimum: 10, unit: 'Portion', image: '/images/bowl.jpg' }];
const sampleinitialItems: InventoryItem[] = seedRows.map(([name, sku, category, stock, minimum, unit, image], index) => ({
  id: index + 1, name, sku, category, stock, minimum, unit, image: `/images/${image}`, reorder: 20, cost: '5.00', email: 'admin@acutepos.com', tracked: true, alert: true, negative: false, active: true,
  history: index === 0 ? [{ id: 1, date: '2026-10-28', type: 'Sale', quantity: -5, stock: 50 }, { id: 2, date: '2026-10-27', type: 'Purchase', quantity: 30, stock: 55 }, { id: 3, date: '2026-10-25', type: 'Sale', quantity: -3, stock: 25 }, { id: 4, date: '2026-10-22', type: 'Purchase', quantity: 50, stock: 28 }, { id: 5, date: '2026-10-20', type: 'Sale', quantity: -2, stock: 18 }] : [{ id: 1, date: '2026-10-28', type: 'Opening', quantity: stock, stock }],
}));
const copyItem = (item: InventoryItem): InventoryItem => ({ ...item, history: item.history.map(entry => ({ ...entry })) });
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function StockBadge({ status, dot = false }: { status: StockStatus; dot?: boolean }) { return <span className={`inventory-badge ${status === 'In Stock' ? 'is-in' : status === 'Low Stock' ? 'is-low' : status === 'Out of Stock' ? 'is-out' : 'is-untracked'}`}>{dot && <span aria-hidden="true" />}{status}</span>; }

export default function InventoryWorkspace({ hidden = false, onNavigate }: { hidden?: boolean; onNavigate: (section: string) => void }) {
  const menu = useLegacyMenu(); const canCreate = menu.canCreate('inventory');
  const initialItems = [blankLegacy('inventory', sampleinitialItems[0] as unknown as LegacyRow, menu.snapshot) as unknown as InventoryItem];
  const databaseItems = legacyRows(menu.snapshot, 'items');
  const databaseCategories = legacyRows(menu.snapshot, 'categories').map(row => row.name as string);
  const catalog = databaseItems.map(row => ({name: row.name as string, sku: row.sku as string, category: row.categories[0] || '', image: row.images[0] as string}));
  const categories = databaseCategories;

  const [items, setItems] = useLegacyCollection<InventoryItem>('inventory'); const [draft, setDraft] = useLegacyDraft<InventoryItem>('inventory', initialItems[0]);
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('All Categories'); const [status, setStatus] = useState('All Status'); const [stockFilter, setStockFilter] = useState('All Stock');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const [selected, setSelected] = useState<number[]>([]); const [localNotice, setNotice] = useState(''); const notice = menu.error || (menu.loading ? 'Loading menu…' : localNotice); const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const importRef = useRef<HTMLInputElement>(null); const selectAllRef = useRef<HTMLInputElement>(null); const cancelDeleteRef = useRef<HTMLButtonElement>(null); const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const update = <K extends keyof InventoryItem>(key: K, value: InventoryItem[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const filtered = items.filter(item => `${item.name} ${item.sku}`.toLowerCase().includes(query.trim().toLowerCase()) && (category === 'All Categories' || item.category === category) && (status === 'All Status' || item.active === (status === 'Active')) && (stockFilter === 'All Stock' || inventoryStatus(item.stock, item.minimum, item.tracked) === stockFilter));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages); const visibleRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allSelected = visibleRows.length > 0 && visibleRows.every(item => selected.includes(item.id)); const someSelected = visibleRows.some(item => selected.includes(item.id));
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected; }, [someSelected, allSelected]);
  useEffect(() => { if (deleting) cancelDeleteRef.current?.focus(); }, [deleting]);

  function edit(item: InventoryItem) { setDraft(copyItem(item)); setNotice(''); }
  function add() { const item = catalog.find(value => !items.some(existing => existing.name === value.name)); setDraft({ ...copyItem(initialItems[0]), ...(item || catalog[0]), id: Date.now(), sku: item?.sku || '', stock: 0, reorder: 20, cost: '', history: [] }); setNotice(item ? '' : 'All sample menu items have inventory. Choose an item to edit or remove an existing inventory record first.'); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.name || !draft.sku.trim() || !draft.category || !draft.unit) { setNotice('Choose an item and enter a SKU, category and unit.'); return; }
    if (items.some(item => item.id !== draft.id && (item.name === draft.name || item.sku.toLowerCase() === draft.sku.trim().toLowerCase()))) { setNotice('This item or SKU already has an inventory record. Please edit that record.'); return; }
    if (![draft.stock, draft.minimum, draft.reorder].every(Number.isInteger) || draft.minimum < 0 || draft.reorder < 0 || (!draft.negative && draft.stock < 0) || !draft.cost.trim() || !Number.isFinite(Number(draft.cost)) || Number(draft.cost) < 0) { setNotice('Use whole stock quantities, non-negative minimum and reorder quantities, and a valid cost price. Enable negative stock to save a negative quantity.'); return; }
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) { setNotice('Please enter a valid alert email address.'); return; }
    const original = items.find(item => item.id === draft.id); const delta = draft.stock - (original?.stock ?? 0);
    const saved = copyItem({ ...draft, sku: draft.sku.trim(), email: draft.email.trim(), cost: Number(draft.cost).toFixed(2), history: !original || delta !== 0 ? [{ id: Date.now(), date: localDate(), type: original ? 'Adjustment' : 'Opening', quantity: delta, stock: draft.stock }, ...draft.history] : draft.history });
    if (!await setItems(previous => previous.some(item => item.id === saved.id) ? previous.map(item => item.id === saved.id ? saved : item) : [...previous, saved])) return; setDraft(saved); setNotice('Inventory saved. Saved to the database.');
  }
  function selectPage() { setSelected(previous => allSelected ? previous.filter(id => !visibleRows.some(item => item.id === id)) : [...new Set([...previous, ...visibleRows.map(item => item.id)])]); }
  async function bulkActive(active: boolean) { if (!await setItems(previous => previous.map(item => selected.includes(item.id) ? { ...item, active } : item))) return; if (selected.includes(draft.id)) update('active', active); setNotice(`${selected.length} inventory items ${active ? 'activated' : 'deactivated'}.`); setSelected([]); }
  function closeDelete() { setDeleting(null); deleteTriggerRef.current?.focus(); }
  async function remove() { if (!deleting) return; const remaining = items.filter(item => item.id !== deleting.id); if (!await setItems(remaining)) return; setSelected(previous => previous.filter(id => id !== deleting.id)); if (draft.id === deleting.id) { if (remaining[0]) edit(remaining[0]); else add(); } setDeleting(null); setNotice('Inventory record archived in the database.'); }
  function dialogKeys(event: KeyboardEvent<HTMLElement>) { if (event.key === 'Escape') closeDelete(); if (event.key === 'Tab') { const buttons = event.currentTarget.querySelectorAll('button'); const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }
  async function importInventory(file?: File) {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text()); const records = Array.isArray(data) ? data : data && typeof data === 'object' && 'inventory' in data ? data.inventory : null;
      if (!Array.isArray(records) || !records.length) throw new Error();
      const stamp = Date.now();
      const imported = records.map((record: unknown, index: number): InventoryItem => {
        if (!record || typeof record !== 'object' || !('name' in record) || typeof record.name !== 'string' || !('sku' in record) || typeof record.sku !== 'string' || !record.sku.trim() || !('stock' in record) || typeof record.stock !== 'number' || !Number.isInteger(record.stock) || record.stock < 0) throw new Error();
        const item = catalog.find(value => value.name === record.name); if (!item) throw new Error();
        return { ...copyItem(initialItems[0]), ...item, id: stamp + index, sku: record.sku.trim(), stock: record.stock, history: [{ id: stamp + index, date: localDate(), type: 'Opening', quantity: record.stock, stock: record.stock }] };
      });
      const combined = [...items, ...imported]; if (new Set(combined.map(item => item.name)).size !== combined.length || new Set(combined.map(item => item.sku.toLowerCase())).size !== combined.length) { setNotice('Import contains an item or SKU that already has inventory. Edit that record or use an untracked menu item.'); return; }
      if (!await setItems(previous => [...previous, ...imported])) return; setNotice(`${imported.length} inventory records imported into this demo session.`);
    } catch { setNotice('Use a JSON array with an existing menu item name, unique sku, and non-negative whole stock, or an object with an inventory array.'); }
  }

  return <div className="mw-workspace inventory-workspace" hidden={hidden}>
    <div className="mw-page-heading"><div><h1>Inventory Management</h1><p>Track and manage your menu item inventory, stock levels and low stock alerts.</p></div><div className="mw-heading-actions">{false && <button className="mw-button mw-outline" disabled title="હજુ ઉપલબ્ધ નથી"><Icon name="upload" />Import POS JSON</button>}<button style={{ display: canCreate ? undefined : 'none' }} className="mw-button mw-primary" onClick={add}><Icon name="plus" />Add Inventory</button></div></div>
    <input ref={importRef} type="file" hidden accept=".json,application/json" onChange={event => { void importInventory(event.target.files?.[0]); event.target.value = ''; }} />
    <MenuNavigation active="Inventory" onChange={onNavigate} />
    {notice && <div className="mw-notice" data-notice-tone={menu.loading ? 'info' : getNoticeTone(notice, !!menu.error)} role={menu.error ? 'alert' : 'status'}>{notice}<button aria-label="Dismiss inventory notification" onClick={() => { setNotice(''); menu.clearError(); }}>×</button></div>}
    <div className="mw-columns inventory-columns"><section className="mw-panel inventory-list" aria-labelledby="inventory-heading"><h2 id="inventory-heading">Inventory Items ({items.length})</h2>
      <div className="mw-search-row"><div className="mw-search"><Icon name="search" size={20} /><input aria-label="Search inventory items" placeholder="Search inventory items..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><button className="mw-icon-button" aria-label="Reset inventory filters" title="Reset filters" onClick={() => { setQuery(''); setCategory('All Categories'); setStatus('All Status'); setStockFilter('All Stock'); setPage(1); }}><Icon name="filter" size={20} /></button></div>
      <div className="inventory-filters"><select aria-label="Filter inventory category" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option>All Categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filter inventory active status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option>All Status</option><option>Active</option><option>Inactive</option></select><select aria-label="Filter stock levels" value={stockFilter} onChange={event => { setStockFilter(event.target.value); setPage(1); }}><option>All Stock</option><option>Low Stock</option><option>Out of Stock</option><option>In Stock</option><option>Not Tracked</option></select></div>
      {selected.length > 0 && <div className="inventory-selection"><span>{selected.length} selected</span><button onClick={() => bulkActive(true)}>Activate</button><button onClick={() => bulkActive(false)}>Deactivate</button><button onClick={() => setSelected([])}>Clear</button></div>}
      <div className="mw-table-scroll"><table className="mw-table inventory-table"><thead><tr><th scope="col"><input ref={selectAllRef} type="checkbox" aria-label="Select inventory page" checked={allSelected} disabled={!visibleRows.length} onChange={selectPage} /></th>{['Image', 'Item Name', 'SKU', 'Current Stock', 'Min Stock', 'Unit', 'Status', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{visibleRows.map(item => <tr key={item.id} className={selected.includes(item.id) ? 'is-selected' : ''}><td><input type="checkbox" aria-label={`Select ${item.name} inventory`} checked={selected.includes(item.id)} onChange={() => setSelected(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])} /></td><td><button className="mw-thumbnail" aria-label={`Edit ${item.name} inventory image`} onClick={() => edit(item)}><img src={item.image} alt={item.name} /></button></td><td><button className="mw-name" onClick={() => edit(item)}>{item.name}</button></td><td>{item.sku}</td><td className={item.stock <= 0 && item.tracked ? 'inventory-zero' : ''}>{item.stock}</td><td>{item.minimum}</td><td>{item.unit}</td><td><StockBadge status={inventoryStatus(item.stock, item.minimum, item.tracked)} /></td><td><div className="mw-row-actions"><button aria-label={`Edit ${item.name} inventory`} onClick={() => edit(item)}><Icon name="edit" size={18} /></button><button className="mw-delete" aria-label={`Delete ${item.name} inventory`} onClick={event => { deleteTriggerRef.current = event.currentTarget; setDeleting(item); }}><Icon name="trash" size={18} /></button></div></td></tr>)}</tbody></table>{!visibleRows.length && <div className="mw-empty">No inventory items match your search and filters.</div>}</div>
      <div className="mw-pagination inventory-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} items</span><div><button aria-label="Previous inventory page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: pages }, (_, index) => index + 1).filter(number => number === 1 || number === pages || Math.abs(number - currentPage) <= 1).map(number => <button key={number} aria-label={`Inventory page ${number}`} aria-current={number === currentPage ? 'page' : undefined} className={number === currentPage ? 'is-active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button aria-label="Next inventory page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button><select aria-label="Inventory items per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={5}>5 / page</option><option value={25}>25 / page</option></select></div></div>
    </section><section className="mw-panel inventory-editor" style={{ display: canCreate || (draft as unknown as { _dbId?: string })._dbId ? undefined : 'none' }} aria-labelledby="inventory-editor-heading"><h2 id="inventory-editor-heading">Add / Edit Inventory</h2>
      <div className="inventory-editor-content"><form className="inventory-form" onSubmit={save} noValidate>
        <div className="mw-form-row"><Field label="Item Name" required><select value={draft.name} onChange={event => { const item = catalog.find(value => value.name === event.target.value); if (item) setDraft(previous => ({ ...previous, ...item })); }}>{catalog.map(item => <option key={item.name}>{item.name}</option>)}</select></Field><Field label="SKU" required><input value={draft.sku} placeholder="Enter SKU" onChange={event => update('sku', event.target.value)} /></Field></div>
        <div className="mw-form-row"><Field label="Category" required><select value={draft.category} onChange={event => update('category', event.target.value)}>{categories.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Unit" required><select value={draft.unit} onChange={event => update('unit', event.target.value)}>{units.map(value => <option key={value}>{value}</option>)}</select></Field></div>
        <div className="mw-form-row"><Field label="Current Stock" required><input type="number" min={draft.negative ? undefined : 0} step={1} value={draft.stock} onChange={event => update('stock', Number(event.target.value))} /></Field><Field label="Minimum Stock" required><input type="number" min={0} step={1} value={draft.minimum} onChange={event => update('minimum', Number(event.target.value))} /></Field></div>
        <div className="mw-form-row"><Field label="Reorder Quantity"><input type="number" min={0} step={1} value={draft.reorder} onChange={event => update('reorder', Number(event.target.value))} /></Field><Field label="Cost Price"><div className="inventory-cost-input"><span>$</span><input aria-label="Cost price" type="number" min={0} step="0.01" value={draft.cost} placeholder="0.00" onChange={event => update('cost', event.target.value)} /></div></Field></div>
        <Field label="Alert Email"><input type="email" value={draft.email} onChange={event => update('email', event.target.value)} /></Field>
        <div className="inventory-toggle-grid">{([['tracked', 'Track Inventory'], ['alert', 'Low Stock Alert'], ['negative', 'Allow Negative Stock'], ['active', 'Active']] as const).map(([key, label]) => <div key={key}><Toggle checked={draft[key]} label={label} onChange={() => update(key, !draft[key])} /><span>{label}</span></div>)}</div>
        <div className="mw-editor-actions inventory-editor-actions"><button type="button" className="mw-button" onClick={() => { const original = items.find(item => item.id === draft.id) || items[0]; if (original) edit(original); else add(); setNotice('Changes cancelled.'); }}>Cancel</button><button type="submit" className="mw-button mw-primary">Save Inventory</button></div>
      </form><div className="inventory-preview-column"><section className="mw-preview inventory-preview" aria-label="Inventory item preview"><h3>Item Preview</h3><img className="inventory-preview-image" src={draft.image} alt={draft.name} /><h3 className="inventory-preview-name">{draft.name}</h3><dl><div><dt>SKU:</dt><dd>{draft.sku || '—'}</dd></div><div><dt>Unit:</dt><dd>{draft.unit}</dd></div><div><dt>Current Stock:</dt><dd>{draft.stock}</dd></div><div><dt>Min Stock:</dt><dd>{draft.minimum}</dd></div><div><dt>Status:</dt><dd><StockBadge status={inventoryStatus(draft.stock, draft.minimum, draft.tracked)} dot /></dd></div></dl></section><section className="inventory-history" aria-labelledby="inventory-history-heading"><h3 id="inventory-history-heading">Stock History</h3><div className="mw-table-scroll"><table><thead><tr>{['Date', 'Type', 'Qty', 'Stock'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{draft.history.slice(0, 5).map(entry => <tr key={entry.id}><td>{dateLabel(entry.date)}</td><td>{entry.type}</td><td className={entry.quantity > 0 ? 'inventory-positive' : ''}>{entry.quantity > 0 ? '+' : ''}{entry.quantity}</td><td>{entry.stock}</td></tr>)}</tbody></table>{!draft.history.length && <p className="inventory-history-empty">Stock history will appear after saving.</p>}</div></section></div></div>
    </section></div>
    {deleting && <div className="mw-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeDelete(); }}><section className="mw-modal" role="dialog" aria-modal="true" aria-labelledby="delete-inventory-title" onKeyDown={dialogKeys}><h2 id="delete-inventory-title">Delete inventory record?</h2><p>Remove “{deleting.name}” inventory from this demo session?</p><div><button ref={cancelDeleteRef} className="mw-button" onClick={closeDelete}>Cancel</button><button className="mw-button mw-danger" onClick={remove}>Delete Inventory</button></div></section></div>}
  </div>;
}
