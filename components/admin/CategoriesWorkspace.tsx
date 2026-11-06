'use client';
import { getNoticeTone } from '../../lib/notices';
import { useLegacyCollection, useLegacyDraft, useLegacyMenu } from './legacy-menu-client';
import { blankLegacy, legacyRows, type LegacyRow } from '../../lib/menu-legacy-codec';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Field, Icon, MenuNavigation, Toggle } from './MenuControls';

type SampleItem = { name: string; price: number; image: string };
type Category = {
  id: number;
  name: string;
  externalId: string;
  description: string;
  image: string;
  itemCount: number;
  order: number;
  visible: boolean;
  active: boolean;
  samples: SampleItem[];
};

const biryaniSamples: SampleItem[] = [
  { name: 'Chicken Biryani', price: 12.99, image: '/images/biryani.jpg' },
  { name: 'Mutton Biryani', price: 14.99, image: '/images/chicken.jpg' },
  { name: 'Veg Biryani', price: 10.99, image: '/images/bowl.jpg' },
];
const categoryNames = ['Biryani', 'Dinner', 'Combos', 'Pizza', 'Burger', 'Sides', 'Breakfast', 'Beverages', 'Desserts', 'Special Offers', 'Starters', 'Breads'];
const categoryImages = ['biryani.jpg', 'bowl.jpg', 'chicken.jpg', 'category-5.jpg', 'wrap.jpg', 'samosas.jpg', 'wrap-detail.jpg', 'lassi.jpg', 'category-9.jpg', '', 'samosas.jpg', 'naan.jpg'];
const sampleinitialCategories: Category[] = categoryNames.map((name, index) => ({
  id: index + 1,
  name,
  externalId: name.toLowerCase().replaceAll(' ', '-'),
  description: index === 0 ? 'Rice dishes with authentic spices.' : `Explore our delicious ${name.toLowerCase()}, freshly prepared for you.`,
  image: categoryImages[index] ? `/images/${categoryImages[index]}` : '',
  itemCount: [18, 24, 10, 16, 12, 14, 9, 11, 8, 6, 15, 7][index],
  order: index + 1,
  visible: true,
  active: index !== 9,
  samples: index === 0 ? biryaniSamples : [
    { name: `${name} Special`, price: 9.99, image: `/images/${categoryImages[index] || 'chicken.jpg'}` },
    { name: `Classic ${name}`, price: 12.99, image: '/images/bowl.jpg' },
    { name: `House ${name}`, price: 10.99, image: '/images/chicken.jpg' },
  ],
}));

function CategoryImage({ category, className = '' }: { category: Category; className?: string }) {
  return category.image
    ? <img className={className} src={category.image} alt={category.name || 'Category image'} />
    : <span className={`cat-offer-image ${className}`} aria-label="Special offers">%</span>;
}

export default function CategoriesWorkspace({ onNavigate, hidden = false }: { onNavigate: (section: string) => void; hidden?: boolean }) {
  const menu = useLegacyMenu(); const canCreate = menu.canCreate('categories');
  const initialCategories = [blankLegacy('categories', sampleinitialCategories[0] as unknown as LegacyRow, menu.snapshot) as unknown as Category];

  const [categories, setCategories] = useLegacyCollection<Category>('categories');
  const [draft, setDraft] = useLegacyDraft<Category>('categories', initialCategories[0]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All Status');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [localNotice, setNotice] = useState(''); const notice = menu.error || (menu.loading ? 'Loading menu…' : localNotice);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const filtered = categories.filter(category => category.name.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'All Status' || category.active === (status === 'Active')));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const update = <K extends keyof Category>(key: K, value: Category[K]) => setDraft(previous => ({ ...previous, [key]: value }));

  useEffect(() => { if (deleting) cancelDeleteRef.current?.focus(); }, [deleting]);

  function edit(category: Category) {
    setDraft({ ...category });
    setNotice('');
  }

  function addCategory() {
    setDraft({ id: Date.now(), name: '', externalId: '', description: '', image: '/images/biryani.jpg', itemCount: 0, order: Math.max(0, ...categories.map(category => category.order)) + 1, visible: true, active: true, samples: [] });
    setNotice('');
    nameRef.current?.focus();
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) { setNotice('Please enter a category name.'); nameRef.current?.focus(); return; }
    if (categories.some(category => category.id !== draft.id && category.name.toLowerCase() === draft.name.trim().toLowerCase())) { setNotice('A category with this name already exists.'); nameRef.current?.focus(); return; }
    const saved = { ...draft, name: draft.name.trim(), externalId: draft.externalId.trim() };
    if (!await setCategories(previous => previous.some(category => category.id === saved.id) ? previous.map(category => category.id === saved.id ? saved : category) : [...previous, saved])) return;
    setDraft(saved);
    setNotice('Category saved. Saved to the database.');
  }

  async function changeOrder(id: number, value: string) {
    const order = Number(value);
    if (!Number.isInteger(order) || order < 1) return;
    if (!await setCategories(previous => previous.map(category => category.id === id ? { ...category, order } : category))) return;
    if (draft.id === id) update('order', order);
  }

  async function toggleActive(category: Category) {
    if (!await setCategories(previous => previous.map(item => item.id === category.id ? { ...item, active: !item.active } : item))) return;
    if (draft.id === category.id) update('active', !category.active);
  }

  function uploadImage(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setNotice('Please choose a PNG, JPG or WebP image.'); return; }
    if (file.size > 2 * 1024 * 1024) { setNotice('Please choose an image smaller than 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => update('image', String(reader.result));
    reader.onerror = () => setNotice('This image could not be read. Please try another image.');
    reader.readAsDataURL(file);
  }

  async function importCategories(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      const rows = Array.isArray(data) ? data : data && typeof data === 'object' && 'categories' in data ? data.categories : null;
      if (!Array.isArray(rows) || !rows.length) throw new Error();
      const imported: Category[] = rows.map((row: unknown, index: number) => {
        if (!row || typeof row !== 'object' || !('name' in row) || typeof row.name !== 'string' || !row.name.trim()) throw new Error();
        return { id: Date.now() + index, name: row.name.trim(), externalId: 'externalId' in row && typeof row.externalId === 'string' ? row.externalId : row.name.toLowerCase().replaceAll(' ', '-'), description: 'description' in row && typeof row.description === 'string' ? row.description.slice(0, 500) : '', image: '/images/biryani.jpg', itemCount: 0, order: categories.length + index + 1, visible: true, active: true, samples: [] };
      });
      const allNames = [...categories, ...imported].map(category => category.name.toLowerCase());
      if (new Set(allNames).size !== allNames.length) { setNotice('Import contains duplicate category names. Please use unique names.'); return; }
      if (!await setCategories(previous => [...previous, ...imported])) return;
      setNotice(`${imported.length} categories imported into this demo session.`);
    } catch { setNotice('Use a JSON array of categories with a name, or an object with a categories array.'); }
  }

  function closeDelete() { setDeleting(null); deleteTriggerRef.current?.focus(); }
  async function deleteCategory() {
    if (!deleting) return;
    const remaining = categories.filter(category => category.id !== deleting.id);
    if (!await setCategories(remaining)) return;
    if (draft.id === deleting.id) setDraft(remaining[0] ? { ...remaining[0] } : { ...initialCategories[0], id: Date.now(), name: '', itemCount: 0, samples: [] });
    setDeleting(null);
    setNotice('Category archived in the database.');
    nameRef.current?.focus();
  }

  return <div className="mw-workspace cat-workspace" hidden={hidden}>
    <div className="mw-page-heading">
      <div><h1>Menu Management</h1><p>Add, edit and organize your menu items, categories, variants, modifiers and more.</p></div>
      <div className="mw-heading-actions">{false && <button className="mw-button mw-outline" disabled title="હજુ ઉપલબ્ધ નથી"><Icon name="upload" />Import POS JSON</button>}<button style={{ display: canCreate ? undefined : 'none' }} className="mw-button mw-primary" onClick={addCategory}><Icon name="plus" />Add Category</button></div>
    </div>
    <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => { void importCategories(event); }} />
    <MenuNavigation active="Categories" onChange={onNavigate} />
    {notice && <div className="mw-notice" data-notice-tone={menu.loading ? 'info' : getNoticeTone(notice, !!menu.error)} role={menu.error ? 'alert' : 'status'}>{notice}<button aria-label="Dismiss notification" onClick={() => { setNotice(''); menu.clearError(); }}>×</button></div>}
    <div className="mw-columns cat-columns">
      <section className="mw-panel cat-list" aria-labelledby="categories-heading">
        <h2 id="categories-heading">Categories ({categories.length})</h2>
        <div className="mw-search-row"><div className="mw-search"><Icon name="search" size={19} /><input aria-label="Search categories" placeholder="Search categories..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><button className={`mw-icon-button mw-filter ${filtersOpen ? 'is-active' : ''}`} aria-label="Filter categories" aria-expanded={filtersOpen} aria-controls="category-filters" onClick={() => setFiltersOpen(previous => !previous)}><Icon name="filter" /></button></div>
        {filtersOpen && <div className="cat-filter-options" id="category-filters"><select aria-label="Filter category status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option>All Status</option><option>Active</option><option>Inactive</option></select><button type="button" onClick={() => { setQuery(''); setStatus('All Status'); setPage(1); }}>Clear filters</button></div>}
        <div className="mw-table-scroll"><table className="mw-table cat-table"><thead><tr>{['#', 'Image', 'Category Name', 'Items', 'Display Order', 'Status', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{pageItems.map((category, index) => <tr key={category.id}>
          <td>{(currentPage - 1) * pageSize + index + 1}</td>
          <td><button className="mw-thumbnail" aria-label={`Edit ${category.name} image`} onClick={() => edit(category)}><CategoryImage category={category} /></button></td>
          <td><button className="mw-name" onClick={() => edit(category)}>{category.name}</button></td>
          <td>{category.itemCount}</td>
          <td><input className="cat-order-input" aria-label={`${category.name} display order`} type="number" min={1} step={1} value={category.order} onChange={event => changeOrder(category.id, event.target.value)} /></td>
          <td><Toggle label={`${category.name} active`} checked={category.active} onChange={() => toggleActive(category)} /></td>
          <td><div className="mw-row-actions"><button aria-label={`Edit ${category.name}`} onClick={() => edit(category)}><Icon name="edit" size={18} /></button><button className="mw-delete" aria-label={`Delete ${category.name}`} onClick={event => { deleteTriggerRef.current = event.currentTarget; setDeleting(category); }}><Icon name="trash" size={18} /></button></div></td>
        </tr>)}</tbody></table>{!filtered.length && <div className="mw-empty">No categories found. Try another search or add a category.</div>}</div>
        <div className="mw-pagination cat-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} categories</span><div><button aria-label="Previous category page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).filter(number => number === 1 || number === pageCount || Math.abs(number - currentPage) <= 1).map(number => <button key={number} aria-label={`Category page ${number}`} aria-current={number === currentPage ? 'page' : undefined} className={number === currentPage ? 'is-active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button aria-label="Next category page" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>›</button><select aria-label="Categories per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={5}>5 / page</option><option value={20}>20 / page</option></select></div></div>
      </section>
      <section className="mw-panel cat-editor" style={{ display: canCreate || (draft as unknown as { _dbId?: string })._dbId ? undefined : 'none' }} aria-labelledby="category-editor-heading">
        <h2 id="category-editor-heading">Add / Edit Category</h2>
        <div className="cat-editor-content">
          <form className="cat-form" onSubmit={saveCategory}>
            <Field label="Category Name" required><input ref={nameRef} required maxLength={100} value={draft.name} placeholder="Enter category name" onChange={event => update('name', event.target.value)} /></Field>
            <Field label="External Category ID (POS)"><input value={draft.externalId} placeholder="e.g. biryani" onChange={event => update('externalId', event.target.value)} /></Field>
            <Field label="Description"><textarea maxLength={500} value={draft.description} placeholder="Enter category description" onChange={event => update('description', event.target.value)} /><small>{draft.description.length}/500</small></Field>
            <div className="cat-image-field"><span>Category Image</span><button type="button" className={`cat-upload ${dragging ? 'is-dragging' : ''}`} onClick={() => uploadRef.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); uploadImage(event.dataTransfer.files[0]); }}><Icon name="upload" size={34} /><span><strong>Click to upload</strong> or drag and drop</span><small>PNG, JPG, WebP (Max 2MB)</small></button><input ref={uploadRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => { uploadImage(event.target.files?.[0]); event.target.value = ''; }} /></div>
            <Field label="Display Order"><input className="cat-form-order" type="number" min={1} step={1} required value={draft.order} onChange={event => update('order', Number(event.target.value))} /></Field>
            <div className="cat-form-toggles"><div className="mw-switch-label"><Toggle checked={draft.visible} label="Visible on Website" onChange={() => update('visible', !draft.visible)} /><span>Visible on Website</span></div><div className="mw-switch-label"><Toggle checked={draft.active} label="Category active" onChange={() => update('active', !draft.active)} /><span>Active</span></div></div>
            <div className="mw-editor-actions cat-form-actions"><button type="button" className="mw-button" onClick={() => { edit(categories.find(category => category.id === draft.id) || categories[0] || initialCategories[0]); setNotice('Changes cancelled.'); }}>Cancel</button><button className="mw-button mw-primary" type="submit">Save Category</button></div>
          </form>
          <section className="mw-preview cat-preview" aria-label="Category preview">
            <h3>Category Preview</h3><CategoryImage category={draft} className="cat-preview-image" />
            <div className="cat-preview-title"><h3>{draft.name || 'New Category'}</h3><span className={`cat-status ${draft.active ? 'is-active' : ''}`}>{draft.active ? 'Active' : 'Inactive'}</span></div>
            <p className="cat-preview-description">{draft.description || 'Your category description will appear here.'}</p>
            <div className="cat-preview-details"><p>Total Items: <strong>{draft.itemCount}</strong></p><p>Display Order: <strong>{draft.order}</strong></p></div>
            <div className="cat-preview-samples"><h4>Sample Items in this Category</h4>{draft.samples.length ? <div className="cat-sample-grid">{draft.samples.map(item => <div key={item.name}><img src={item.image} alt={item.name} /><span>{item.name}</span><strong>${item.price.toFixed(2)}</strong></div>)}</div> : <p className="cat-no-samples">Items will appear here once added to this category.</p>}</div>
          </section>
        </div>
      </section>
    </div>
    {deleting && <div className="mw-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeDelete(); }}><section className="mw-modal" role="dialog" aria-modal="true" aria-labelledby="delete-category-title" onKeyDown={event => { if (event.key === 'Escape') closeDelete(); if (event.key === 'Tab') { const buttons = event.currentTarget.querySelectorAll('button'); const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }}><h2 id="delete-category-title">Delete category?</h2><p>Remove “{deleting.name}” from this demo session?</p><div><button ref={cancelDeleteRef} className="mw-button" onClick={closeDelete}>Cancel</button><button className="mw-button mw-danger" onClick={deleteCategory}>Delete Category</button></div></section></div>}
  </div>;
}
