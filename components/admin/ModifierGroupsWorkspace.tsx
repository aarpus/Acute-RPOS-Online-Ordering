'use client';
import { getNoticeTone } from '../../lib/notices';
import { useLegacyCollection, useLegacyDraft, useLegacyMenu } from './legacy-menu-client';
import { blankLegacy, legacyRows, type LegacyRow } from '../../lib/menu-legacy-codec';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Field, Icon, MenuNavigation, Toggle } from './MenuControls';

type ModifierOption = { id: number; name: string; price: number; image: string; isDefault: boolean; active: boolean; order: number };
type ModifierGroup = { id: number; name: string; externalId: string; description: string; type: 'Single' | 'Multiple'; min: number; max: number; required: boolean; active: boolean; order: number; image: string; options: ModifierOption[] };
const groupRows: [string, 'Single' | 'Multiple', number, number, boolean, string, string[]][] = [
  ['Spice Level', 'Single', 1, 1, true, 'category-0.jpg', ['Mild', 'Medium', 'Hot', 'Extra Hot']],
  ['Size', 'Single', 1, 1, true, 'biryani.jpg', ['Small', 'Medium', 'Large']],
  ['Sauce Options', 'Multiple', 0, 3, false, 'bowl.jpg', ['Mint Sauce', 'Tamarind Sauce', 'Garlic Sauce']],
  ['Extra Add-ons', 'Multiple', 0, 5, false, 'chicken.jpg', ['Extra Chicken', 'Extra Rice', 'Raita', 'Salad', 'Garlic Naan']],
  ['Cheese Type', 'Single', 1, 1, true, 'category-2.jpg', ['Mozzarella', 'Cheddar', 'Paneer']],
  ['Bread Type', 'Single', 1, 1, false, 'naan.jpg', ['Plain Naan', 'Garlic Naan', 'Tandoori Roti']],
  ['Toppings', 'Multiple', 0, 4, false, 'category-1.jpg', ['Onion', 'Tomato', 'Peppers', 'Olives']],
  ['Drink Options', 'Single', 1, 1, false, 'lassi.jpg', ['Soft Drink', 'Mango Lassi', 'Water']],
];
const sampleinitialGroups: ModifierGroup[] = groupRows.map(([name, type, min, max, required, image, names], index) => ({
  id: index + 1, name, type, min, max, required, active: index !== 7, order: index + 1, image: `/images/${image}`,
  externalId: index === 0 ? 'GRP-SPICE' : `GRP-${name.toUpperCase().replaceAll(' ', '-')}`,
  description: index === 0 ? 'Select spice level for your dish.' : `Choose your preferred ${name.toLowerCase()} for your dish.`,
  options: names.map((name, optionIndex) => ({ id: (index + 1) * 100 + optionIndex, name, price: index === 0 || index === 1 ? 0 : [0, 1.99, 2.99, 3.99, 4.99][optionIndex], image: `/images/${index === 0 ? ['category-0.jpg', 'category-2.jpg', 'category-1.jpg', 'chicken.jpg'][optionIndex] : image}`, isDefault: optionIndex === 0, active: true, order: optionIndex + 1 })),
}));
const copyGroup = (group: ModifierGroup): ModifierGroup => ({ ...group, options: group.options.map(option => ({ ...option })) });
type DeleteTarget = { type: 'group'; group: ModifierGroup } | { type: 'option'; option: ModifierOption };

function trapDialog(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key === 'Escape') close();
  if (event.key !== 'Tab') return;
  const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([type="file"]):not([disabled]),select,textarea');
  const first = controls[0]; const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

export default function ModifierGroupsWorkspace({ hidden = false, onNavigate }: { hidden?: boolean; onNavigate: (section: string) => void }) {
  const menu = useLegacyMenu(); const canCreate = menu.canCreate('modifier-groups');
  const initialGroups = [blankLegacy('modifier-groups', sampleinitialGroups[0] as unknown as LegacyRow, menu.snapshot) as unknown as ModifierGroup];

  const [groups, setGroups] = useLegacyCollection<ModifierGroup>('modifier-groups'); const [draft, setDraft] = useLegacyDraft<ModifierGroup>('modifier-groups', initialGroups[0]);
  const [query, setQuery] = useState(''); const [type, setType] = useState('All Types'); const [status, setStatus] = useState('All Status');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const [localNotice, setNotice] = useState(''); const notice = menu.error || (menu.loading ? 'Loading menu…' : localNotice);
  const [optionDraft, setOptionDraft] = useState<ModifierOption | null>(null); const [optionError, setOptionError] = useState('');
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const nameRef = useRef<HTMLInputElement>(null); const optionNameRef = useRef<HTMLInputElement>(null); const importRef = useRef<HTMLInputElement>(null); const imageRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null); const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const filtered = groups.filter(group => group.name.toLowerCase().includes(query.trim().toLowerCase()) && (type === 'All Types' || group.type === type) && (status === 'All Status' || group.active === (status === 'Active')));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const update = <K extends keyof ModifierGroup>(key: K, value: ModifierGroup[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const updateOption = (id: number, values: Partial<ModifierOption>) => setDraft(previous => ({ ...previous, options: previous.options.map(option => option.id === id ? { ...option, ...values } : option) }));

  useEffect(() => { if (optionDraft) optionNameRef.current?.focus(); }, [optionDraft?.id]);
  useEffect(() => { if (deleting) cancelDeleteRef.current?.focus(); }, [deleting]);

  function edit(group: ModifierGroup) { setDraft(copyGroup(group)); setNotice(''); }
  function addGroup() { setDraft({ ...copyGroup(initialGroups[0]), id: Date.now(), name: '', externalId: '', description: '', options: [], min: 0, max: 1, required: false, order: Math.max(0, ...groups.map(group => group.order)) + 1 }); setNotice(''); nameRef.current?.focus(); }
  async function saveGroup(event: FormEvent) {
    event.preventDefault();
    const activeCount = draft.options.filter(option => option.active).length;
    if (!draft.name.trim()) { setNotice('Please enter a group name.'); nameRef.current?.focus(); return; }
    if (groups.some(group => group.id !== draft.id && group.name.toLowerCase() === draft.name.trim().toLowerCase())) { setNotice('A modifier group with this name already exists.'); return; }
    if (!Number.isInteger(draft.min) || !Number.isInteger(draft.max) || draft.min < 0 || draft.max < 1 || draft.max < draft.min || (draft.type === 'Single' && draft.max !== 1) || (draft.required && draft.min < 1) || !Number.isInteger(draft.order) || draft.order < 1) { setNotice('Check the selection limits and display order. Single selection allows a maximum of one; required groups need a minimum of one.'); return; }
    if (draft.max > activeCount) { setNotice('Add enough active options for the maximum selection limit.'); return; }
    const saved = copyGroup({ ...draft, name: draft.name.trim(), externalId: draft.externalId.trim() });
    if (!await setGroups(previous => previous.some(group => group.id === saved.id) ? previous.map(group => group.id === saved.id ? saved : group) : [...previous, saved])) return;
    setDraft(saved); setNotice('Modifier group saved. Saved to the database.');
  }
  async function toggleGroup(group: ModifierGroup) { if (!await setGroups(previous => previous.map(value => value.id === group.id ? { ...value, active: !value.active } : value))) return; if (draft.id === group.id) update('active', !group.active); }
  async function setOrder(group: ModifierGroup, value: string) { const order = Number(value); if (!Number.isInteger(order) || order < 1) return; if (!await setGroups(previous => previous.map(current => current.id === group.id ? { ...current, order } : current))) return; if (draft.id === group.id) update('order', order); }
  function selectionType(value: ModifierGroup['type']) { setDraft(previous => { let foundDefault = false; return { ...previous, type: value, min: value === 'Single' ? Math.min(previous.min, 1) : previous.min, max: value === 'Single' ? 1 : previous.max, options: previous.options.map(option => { if (value !== 'Single' || !option.isDefault) return option; const isDefault = !foundDefault; foundDefault = true; return { ...option, isDefault }; }) }; }); }
  function setDefault(option: ModifierOption) { setDraft(previous => ({ ...previous, options: previous.options.map(value => value.id === option.id ? { ...value, isDefault: previous.type === 'Single' ? true : !value.isDefault } : previous.type === 'Single' ? { ...value, isDefault: false } : value) })); }
  function openOption(option?: ModifierOption) { dialogTriggerRef.current = document.activeElement as HTMLElement; setOptionDraft(option ? { ...option } : { id: Date.now(), name: '', price: 0, image: draft.image, isDefault: false, active: true, order: Math.max(0, ...draft.options.map(value => value.order)) + 1 }); setOptionError(''); }
  function closeOption() { setOptionDraft(null); setOptionError(''); dialogTriggerRef.current?.focus(); }
  function saveOption(event: FormEvent) {
    event.preventDefault(); if (!optionDraft) return;
    if (!optionDraft.name.trim() || !Number.isFinite(optionDraft.price) || optionDraft.price < 0 || !Number.isInteger(optionDraft.order) || optionDraft.order < 1) { setOptionError('Enter an option name, a valid price and a positive whole display order.'); return; }
    if (draft.options.some(option => option.id !== optionDraft.id && option.name.toLowerCase() === optionDraft.name.trim().toLowerCase())) { setOptionError('This group already has an option with this name.'); return; }
    const saved = { ...optionDraft, name: optionDraft.name.trim() };
    setDraft(previous => {
      const options = previous.options.map(option => option.id === saved.id ? saved : previous.type === 'Single' && saved.isDefault ? { ...option, isDefault: false } : option);
      return { ...previous, options: options.some(option => option.id === saved.id) ? options : [...options, saved] };
    });
    closeOption();
  }
  function closeDelete() { setDeleting(null); dialogTriggerRef.current?.focus(); }
  async function remove() {
    if (!deleting) return;
    if (deleting.type === 'option') { update('options', draft.options.filter(option => option.id !== deleting.option.id)); setNotice('Option removed from the draft. Save the group to keep this change.'); }
    else { const remaining = groups.filter(group => group.id !== deleting.group.id); if (!await setGroups(remaining)) return; if (draft.id === deleting.group.id) { if (remaining[0]) edit(remaining[0]); else addGroup(); } setNotice('Modifier group archived in the database.'); }
    setDeleting(null); nameRef.current?.focus();
  }
  function uploadOptionImage(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setOptionError('Choose a PNG, JPG or WebP image smaller than 2 MB.'); return; }
    const reader = new FileReader(); reader.onload = () => setOptionDraft(previous => previous ? { ...previous, image: String(reader.result) } : previous); reader.onerror = () => setOptionError('The image could not be read.'); reader.readAsDataURL(file);
  }
  async function importGroups(file?: File) {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      const records = Array.isArray(data) ? data : data && typeof data === 'object' && 'modifierGroups' in data ? data.modifierGroups : null;
      if (!Array.isArray(records) || !records.length) throw new Error();
      const stamp = Date.now();
      const imported = records.map((record: unknown, index: number): ModifierGroup => {
        if (!record || typeof record !== 'object' || !('name' in record) || typeof record.name !== 'string' || !record.name.trim()) throw new Error();
        return { ...copyGroup(initialGroups[0]), id: stamp + index, name: record.name.trim(), externalId: `GRP-IMPORT-${stamp}-${index + 1}`, description: 'Choose an option for your dish.', order: Math.max(0, ...groups.map(group => group.order)) + index + 1 };
      });
      const names = [...groups, ...imported].map(group => group.name.toLowerCase());
      if (new Set(names).size !== names.length) { setNotice('Import contains duplicate group names. Please use unique names.'); return; }
      if (!await setGroups(previous => [...previous, ...imported])) return; setNotice(`${imported.length} modifier groups imported using sample options for this demo.`);
    } catch { setNotice('Use a JSON array of groups with a name, or an object with a modifierGroups array.'); }
  }

  return <div className="mw-workspace modifier-workspace" hidden={hidden}>
    <div className="mw-page-heading"><div><h1>Menu Management</h1><p>Add, edit and organize your menu items, categories, variants, modifiers and more.</p></div><div className="mw-heading-actions">{false && <button className="mw-button mw-outline" disabled title="હજુ ઉપલબ્ધ નથી"><Icon name="upload" />Import POS JSON</button>}<button style={{ display: canCreate ? undefined : 'none' }} className="mw-button mw-primary" onClick={addGroup}><Icon name="plus" />Add Modifier Group</button></div></div>
    <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={event => { void importGroups(event.target.files?.[0]); event.target.value = ''; }} />
    <MenuNavigation active="Modifier Groups" onChange={onNavigate} />
    {notice && <div className="mw-notice" data-notice-tone={menu.loading ? 'info' : getNoticeTone(notice, !!menu.error)} role={menu.error ? 'alert' : 'status'}>{notice}<button aria-label="Dismiss modifier notification" onClick={() => { setNotice(''); menu.clearError(); }}>×</button></div>}
    <div className="mw-columns modifier-columns">
      <section className="mw-panel modifier-list" aria-labelledby="modifier-groups-heading"><h2 id="modifier-groups-heading">Modifier Groups ({groups.length})</h2>
        <div className="mw-search-row"><div className="mw-search"><Icon name="search" size={19} /><input aria-label="Search modifier groups" placeholder="Search modifier groups..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><button className="mw-icon-button" aria-label="Reset modifier group filters" title="Reset filters" onClick={() => { setQuery(''); setType('All Types'); setStatus('All Status'); setPage(1); }}><Icon name="filter" size={19} /></button></div>
        <div className="mw-filters modifier-filters"><select aria-label="Filter modifier selection type" value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option>All Types</option><option>Single</option><option>Multiple</option></select><select aria-label="Filter modifier group status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option>All Status</option><option>Active</option><option>Inactive</option></select></div>
        <div className="mw-table-scroll"><table className="mw-table modifier-table"><thead><tr>{['#', 'Group Name', 'Type', 'Min', 'Max', 'Required', 'Status', 'Display Order', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{rows.map((group, index) => <tr key={group.id}>
          <td>{(currentPage - 1) * pageSize + index + 1}</td><td><button className="modifier-group-name" onClick={() => edit(group)}><img src={group.image} alt="" /><span>{group.name}</span></button></td><td>{group.type}</td><td>{group.min}</td><td>{group.max}</td><td>{group.required ? 'Yes' : 'No'}</td><td><Toggle label={`${group.name} group active`} checked={group.active} onChange={() => toggleGroup(group)} /></td><td><input className="modifier-order" type="number" min={1} step={1} aria-label={`${group.name} display order`} value={group.order} onChange={event => setOrder(group, event.target.value)} /></td><td><div className="mw-row-actions"><button aria-label={`Edit ${group.name}`} onClick={() => edit(group)}><Icon name="edit" size={18} /></button><button className="mw-delete" aria-label={`Delete ${group.name}`} onClick={event => { dialogTriggerRef.current = event.currentTarget; setDeleting({ type: 'group', group }); }}><Icon name="trash" size={18} /></button></div></td>
        </tr>)}</tbody></table>{!rows.length && <div className="mw-empty">No modifier groups match your search and filters.</div>}</div>
        <div className="mw-pagination modifier-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} modifier groups</span><div><button aria-label="Previous modifier groups page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: pages }, (_, index) => index + 1).filter(number => number === 1 || number === pages || Math.abs(number - currentPage) <= 1).map(number => <button key={number} aria-label={`Modifier groups page ${number}`} aria-current={number === currentPage ? 'page' : undefined} className={number === currentPage ? 'is-active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button aria-label="Next modifier groups page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button><select aria-label="Modifier groups per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={5}>5 / page</option><option value={20}>20 / page</option></select></div></div>
      </section>
      <section className="mw-panel modifier-editor" style={{ display: canCreate || (draft as unknown as { _dbId?: string })._dbId ? undefined : 'none' }} aria-labelledby="modifier-editor-heading"><h2 id="modifier-editor-heading">Add / Edit Modifier Group</h2>
        <form onSubmit={saveGroup} noValidate>
          <div className="modifier-editor-content"><div className="modifier-form">
            <div className="mw-form-row modifier-identity"><Field label="Group Name" required><input ref={nameRef} maxLength={100} value={draft.name} placeholder="Enter group name" onChange={event => update('name', event.target.value)} /></Field><Field label="External Group ID (POS)"><input value={draft.externalId} onChange={event => update('externalId', event.target.value)} /></Field></div>
            <Field label="Description"><textarea maxLength={500} value={draft.description} onChange={event => update('description', event.target.value)} /><small>{draft.description.length}/500</small></Field>
            <fieldset className="modifier-selection-type"><legend>Selection Type</legend><div className="mw-radio-row">{(['Single', 'Multiple'] as const).map(value => <label key={value}><input type="radio" name="modifier-selection-type" checked={draft.type === value} onChange={() => selectionType(value)} />{value} Selection</label>)}</div></fieldset>
            <div className="mw-form-row"><Field label="Min Select" required><input type="number" min={draft.required ? 1 : 0} max={draft.max} step={1} value={draft.min} onChange={event => update('min', Number(event.target.value))} /></Field><Field label="Max Select" required><input type="number" min={1} max={draft.type === 'Single' ? 1 : undefined} step={1} value={draft.max} onChange={event => update('max', Number(event.target.value))} /></Field></div>
            <div className="modifier-toggle-row"><div><Toggle checked={draft.required} label="Group required" onChange={() => setDraft(previous => ({ ...previous, required: !previous.required, min: !previous.required ? Math.max(1, previous.min) : previous.min }))} /><span>Required</span></div><div><Toggle checked={draft.active} label="Group active" onChange={() => update('active', !draft.active)} /><span>Active</span></div></div>
            <div className="modifier-display-field"><Field label="Display Order"><input type="number" min={1} step={1} value={draft.order} onChange={event => update('order', Number(event.target.value))} /></Field></div>
          </div><section className="mw-preview modifier-preview" aria-label="Modifier group preview"><h3>Group Preview</h3><img className="modifier-preview-image" src={draft.image} alt={draft.name || 'Modifier group'} /><div className="modifier-preview-title"><h3>{draft.name || 'New Group'}</h3><span className={`modifier-status ${draft.active ? 'is-active' : ''}`}>{draft.active ? 'Active' : 'Inactive'}</span></div><p>{draft.description || 'Your group description will appear here.'}</p><dl><div><dt>Type:</dt><dd>{draft.type} Selection</dd></div><div><dt>Min Select:</dt><dd>{draft.min}</dd></div><div><dt>Max Select:</dt><dd>{draft.max}</dd></div><div><dt>Required:</dt><dd>{draft.required ? 'Yes' : 'No'}</dd></div><div><dt>Display Order:</dt><dd>{draft.order}</dd></div></dl></section></div>
          <div className="modifier-options-heading" style={{ display: menu.canCreate('modifier-options') ? undefined : 'none' }}><h3>Modifier Options ({draft.options.length})</h3><button style={{ display: menu.canCreate('modifier-options') ? undefined : 'none' }} className="mw-button mw-primary" type="button" onClick={() => openOption()}><Icon name="plus" size={14} />Add Option</button></div>
          <div className="mw-table-scroll" style={{ display: menu.canCreate('modifier-options') ? undefined : 'none' }}><table className="mw-table modifier-options-table"><thead><tr>{['#', 'Image', 'Option Name', 'Price', 'Default', 'Status', 'Display Order', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{draft.options.map((option, index) => <tr key={option.id}><td>{index + 1}</td><td><button type="button" className="mw-thumbnail" aria-label={`Edit ${option.name} image`} onClick={() => openOption(option)}><img src={option.image} alt={option.name} /></button></td><td><button type="button" className="mw-name" onClick={() => openOption(option)}>{option.name}</button></td><td>${option.price.toFixed(2)}</td><td><input className="modifier-default-input" type={draft.type === 'Single' ? 'radio' : 'checkbox'} name="modifier-option-default" aria-label={`${option.name} default option`} checked={option.isDefault} onChange={() => setDefault(option)} /></td><td><Toggle checked={option.active} label={`${option.name} option active`} onChange={() => updateOption(option.id, { active: !option.active })} /></td><td><input className="modifier-order" aria-label={`${option.name} option display order`} type="number" min={1} value={option.order} onChange={event => { const order = Number(event.target.value); if (Number.isInteger(order) && order > 0) updateOption(option.id, { order }); }} /></td><td><div className="mw-row-actions"><button type="button" aria-label={`Edit ${option.name} option`} onClick={() => openOption(option)}><Icon name="edit" size={17} /></button><button type="button" className="mw-delete" aria-label={`Delete ${option.name} option`} onClick={event => { dialogTriggerRef.current = event.currentTarget; setDeleting({ type: 'option', option }); }}><Icon name="trash" size={17} /></button></div></td></tr>)}</tbody></table>{!draft.options.length && <div className="mw-empty">Add modifier options to this group.</div>}</div>
          <div className="mw-editor-actions modifier-editor-actions"><button type="button" className="mw-button" onClick={() => { const original = groups.find(group => group.id === draft.id) || groups[0]; if (original) edit(original); else addGroup(); setNotice('Changes cancelled.'); }}>Cancel</button><button type="submit" className="mw-button mw-primary">Save Modifier Group</button></div>
        </form>
      </section>
    </div>
    {optionDraft && menu.canCreate('modifier-options') && <div className="mw-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeOption(); }}><section className="mw-modal modifier-option-modal" role="dialog" aria-modal="true" aria-labelledby="modifier-option-title" onKeyDown={event => trapDialog(event, closeOption)}><h2 id="modifier-option-title">{draft.options.some(option => option.id === optionDraft.id) ? 'Edit Modifier Option' : 'Add Modifier Option'}</h2><form onSubmit={saveOption} noValidate><Field label="Option Name" required><input ref={optionNameRef} maxLength={100} value={optionDraft.name} onChange={event => setOptionDraft({ ...optionDraft, name: event.target.value })} /></Field><div className="mw-form-row"><Field label="Price"><input type="number" min={0} step="0.01" value={optionDraft.price} onChange={event => setOptionDraft({ ...optionDraft, price: Number(event.target.value) })} /></Field><Field label="Display Order"><input type="number" min={1} value={optionDraft.order} onChange={event => setOptionDraft({ ...optionDraft, order: Number(event.target.value) })} /></Field></div><div className="modifier-option-image"><img src={optionDraft.image} alt={optionDraft.name || 'Option image'} /><button type="button" className="mw-button mw-outline" onClick={() => imageRef.current?.click()}><Icon name="upload" size={17} />Change Image</button><input ref={imageRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => { uploadOptionImage(event.target.files?.[0]); event.target.value = ''; }} /></div><div className="modifier-toggle-row"><div><Toggle checked={optionDraft.isDefault} label="Option default" onChange={() => setOptionDraft({ ...optionDraft, isDefault: !optionDraft.isDefault })} /><span>Default</span></div><div><Toggle checked={optionDraft.active} label="Option active" onChange={() => setOptionDraft({ ...optionDraft, active: !optionDraft.active })} /><span>Active</span></div></div>{optionError && <p className="modifier-option-error" role="alert">{optionError}</p>}<div className="mw-editor-actions"><button type="button" className="mw-button" onClick={closeOption}>Cancel</button><button type="submit" className="mw-button mw-primary">Save Option</button></div></form></section></div>}
    {deleting && <div className="mw-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeDelete(); }}><section className="mw-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modifier-title" onKeyDown={event => trapDialog(event, closeDelete)}><h2 id="delete-modifier-title">Delete {deleting.type === 'group' ? 'modifier group' : 'modifier option'}?</h2><p>Remove “{deleting.type === 'group' ? deleting.group.name : deleting.option.name}” from this demo?</p><div><button ref={cancelDeleteRef} className="mw-button" onClick={closeDelete}>Cancel</button><button className="mw-button mw-danger" onClick={remove}>Delete</button></div></section></div>}
  </div>;
}
