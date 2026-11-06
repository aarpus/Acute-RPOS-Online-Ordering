'use client';
import { getNoticeTone } from '../../lib/notices';
import { useLegacyCollection, useLegacyDraft, useLegacyMenu } from './legacy-menu-client';
import { blankLegacy, legacyRows, type LegacyRow } from '../../lib/menu-legacy-codec';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Field, Icon, MenuNavigation, Toggle } from './MenuControls';
import { calculateTaxPreview, type TaxRounding } from '../../lib/admin-tax-preview';

type TaxRule = { id: number; name: string; rate: string; appliesTo: string; externalId: string; description: string; rounding: TaxRounding; order: number; active: boolean; receipt: boolean; delivery: boolean; takeaway: boolean };
const scopes = ['All Items', 'Food Items', 'Beverage Items', 'Alcohol Items', 'Takeaway Orders'];
const roundingTypes: TaxRounding[] = ['No Rounding', 'Round Up', 'Round Down'];
const sampleRows: [string, string, string][] = [
  ['Sales Tax', '8.50', 'All Items'], ['Food Tax', '4.00', 'Food Items'], ['Beverage Tax', '10.00', 'Beverage Items'],
  ['Alcohol Tax', '15.00', 'Alcohol Items'], ['Service Tax', '2.50', 'All Items'], ['Takeaway Tax', '6.00', 'Takeaway Orders'],
];
const sampleinitialRules: TaxRule[] = sampleRows.map(([name, rate, appliesTo], index) => ({ id: index + 1, name, rate, appliesTo, externalId: `TAX-${String(index + 1).padStart(3, '0')}`, description: index === 0 ? 'Standard sales tax for all items.' : `${name} for ${appliesTo.toLowerCase()}.`, rounding: 'No Rounding', order: index + 1, active: index !== 5, receipt: true, delivery: true, takeaway: true }));

function InfoIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></svg>; }

export default function TaxRulesWorkspace({ hidden = false, onNavigate }: { hidden?: boolean; onNavigate: (section: string) => void }) {
  const menu = useLegacyMenu(); const canCreate = menu.canCreate('tax-rules');
  const initialRules = [blankLegacy('tax-rules', sampleinitialRules[0] as unknown as LegacyRow, menu.snapshot) as unknown as TaxRule];

  const [rules, setRules] = useLegacyCollection<TaxRule>('tax-rules'); const [draft, setDraft] = useLegacyDraft<TaxRule>('tax-rules', initialRules[0]);
  const [query, setQuery] = useState(''); const [filterOpen, setFilterOpen] = useState(false); const [status, setStatus] = useState('All Status'); const [scope, setScope] = useState('All Items & Orders');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const [localNotice, setNotice] = useState(''); const notice = menu.error || (menu.loading ? 'Loading menu…' : localNotice); const [deleting, setDeleting] = useState<TaxRule | null>(null);
  const nameRef = useRef<HTMLInputElement>(null); const importRef = useRef<HTMLInputElement>(null); const cancelDeleteRef = useRef<HTMLButtonElement>(null); const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const update = <K extends keyof TaxRule>(key: K, value: TaxRule[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const filtered = rules.filter(rule => rule.name.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'All Status' || rule.active === (status === 'Active')) && (scope === 'All Items & Orders' || rule.appliesTo === scope));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages); const visibleRules = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const rate = Number(draft.rate); const preview = calculateTaxPreview(rate, draft.rounding, draft.active);
  useEffect(() => { if (deleting) cancelDeleteRef.current?.focus(); }, [deleting]);

  function edit(rule: TaxRule) { setDraft({ ...rule }); setNotice(''); }
  function add() { setDraft({ ...initialRules[0], id: Date.now(), name: '', rate: '0.00', externalId: '', description: '', order: Math.max(0, ...rules.map(rule => rule.order)) + 1 }); setNotice(''); nameRef.current?.focus(); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) { setNotice('Please enter a tax name.'); nameRef.current?.focus(); return; }
    if (rules.some(rule => rule.id !== draft.id && rule.name.toLowerCase() === draft.name.trim().toLowerCase())) { setNotice('A tax rule with this name already exists.'); return; }
    if (!draft.rate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) { setNotice('Enter a tax rate between 0 and 100%.'); return; }
    if (!Number.isInteger(draft.order) || draft.order < 1) { setNotice('Display order must be a positive whole number.'); return; }
    const saved = { ...draft, name: draft.name.trim(), rate: rate.toFixed(2), externalId: draft.externalId.trim() };
    if (!await setRules(previous => previous.some(rule => rule.id === saved.id) ? previous.map(rule => rule.id === saved.id ? saved : rule) : [...previous, saved])) return; setDraft(saved); setNotice('Tax rule saved. Saved to the database.');
  }
  async function toggle(rule: TaxRule) { if (!await setRules(previous => previous.map(value => value.id === rule.id ? { ...value, active: !value.active } : value))) return; if (draft.id === rule.id) update('active', !rule.active); }
  async function changeOrder(rule: TaxRule, value: string) { const order = Number(value); if (!Number.isInteger(order) || order < 1) return; if (!await setRules(previous => previous.map(current => current.id === rule.id ? { ...current, order } : current))) return; if (draft.id === rule.id) update('order', order); }
  function closeDelete() { setDeleting(null); deleteTriggerRef.current?.focus(); }
  async function remove() { if (!deleting) return; const remaining = rules.filter(rule => rule.id !== deleting.id); if (!await setRules(remaining)) return; if (draft.id === deleting.id) { if (remaining[0]) edit(remaining[0]); else add(); } setDeleting(null); setNotice('Tax rule archived in the database.'); nameRef.current?.focus(); }
  function dialogKeys(event: KeyboardEvent<HTMLElement>) { if (event.key === 'Escape') closeDelete(); if (event.key === 'Tab') { const buttons = event.currentTarget.querySelectorAll('button'); const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }
  async function importRules(file?: File) {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text()); const records = Array.isArray(data) ? data : data && typeof data === 'object' && 'taxRules' in data ? data.taxRules : null;
      if (!Array.isArray(records) || !records.length) throw new Error();
      const stamp = Date.now();
      const imported: TaxRule[] = records.map((record: unknown, index: number) => {
        if (!record || typeof record !== 'object' || !('name' in record) || typeof record.name !== 'string' || !record.name.trim() || !('rate' in record) || typeof record.rate !== 'number' || !Number.isFinite(record.rate) || record.rate < 0 || record.rate > 100) throw new Error();
        return { ...initialRules[0], id: stamp + index, name: record.name.trim(), rate: record.rate.toFixed(2), appliesTo: 'appliesTo' in record && typeof record.appliesTo === 'string' && scopes.includes(record.appliesTo) ? record.appliesTo : 'All Items', externalId: `TAX-IMPORT-${stamp}-${index + 1}`, description: '', order: Math.max(0, ...rules.map(rule => rule.order)) + index + 1 };
      });
      const names = [...rules, ...imported].map(rule => rule.name.toLowerCase()); if (new Set(names).size !== names.length) { setNotice('Import contains duplicate tax names. Please use unique names.'); return; }
      if (!await setRules(previous => [...previous, ...imported])) return; setNotice(`${imported.length} tax rules imported into this demo session.`);
    } catch { setNotice('Use a JSON array with name and numeric rate fields (0–100), or an object with a taxRules array.'); }
  }

  return <div className="mw-workspace tax-workspace" hidden={hidden}>
    <div className="mw-page-heading"><div><h1>Menu Management</h1><p>Add, edit and organize your menu items, categories, variants, modifiers and more.</p></div><div className="mw-heading-actions">{false && <button className="mw-button mw-outline" disabled title="હજુ ઉપલબ્ધ નથી"><Icon name="upload" />Import POS JSON</button>}<button style={{ display: canCreate ? undefined : 'none' }} className="mw-button mw-primary" onClick={add}><Icon name="plus" />Add Tax Rule</button></div></div>
    <input ref={importRef} type="file" hidden accept=".json,application/json" onChange={event => { void importRules(event.target.files?.[0]); event.target.value = ''; }} />
    <MenuNavigation active="Tax Rules" onChange={onNavigate} />
    {notice && <div className="mw-notice" data-notice-tone={menu.loading ? 'info' : getNoticeTone(notice, !!menu.error)} role={menu.error ? 'alert' : 'status'}>{notice}<button aria-label="Dismiss tax notification" onClick={() => { setNotice(''); menu.clearError(); }}>×</button></div>}
    <div className="mw-columns tax-columns"><section className="mw-panel tax-list" aria-labelledby="tax-rules-heading"><h2 id="tax-rules-heading">Tax Rules ({rules.length})</h2>
      <div className="mw-search-row"><div className="mw-search"><Icon name="search" size={21} /><input aria-label="Search tax rules" placeholder="Search tax rules..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><button className={`mw-icon-button ${filterOpen ? 'is-active' : ''}`} aria-label="Filter tax rules" aria-controls="tax-rule-filters" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}><Icon name="filter" size={21} /></button></div>
      {filterOpen && <div className="tax-filter-options" id="tax-rule-filters"><select aria-label="Filter tax rule status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option>All Status</option><option>Active</option><option>Inactive</option></select><select aria-label="Filter tax rule applicability" value={scope} onChange={event => { setScope(event.target.value); setPage(1); }}><option>All Items &amp; Orders</option>{scopes.map(value => <option key={value}>{value}</option>)}</select><button onClick={() => { setQuery(''); setStatus('All Status'); setScope('All Items & Orders'); setPage(1); }}>Clear</button></div>}
      <div className="mw-table-scroll"><table className="mw-table tax-table"><thead><tr>{['#', 'Tax Name', 'Rate (%)', 'Applies To', 'Status', 'Display Order', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{visibleRules.map((rule, index) => <tr key={rule.id}><td>{(currentPage - 1) * pageSize + index + 1}</td><td><button className="mw-name" onClick={() => edit(rule)}>{rule.name}</button></td><td>{Number(rule.rate).toFixed(2)}%</td><td className="tax-scope-cell">{rule.appliesTo}</td><td><Toggle checked={rule.active} label={`${rule.name} active`} onChange={() => toggle(rule)} /></td><td><input className="tax-order-input" aria-label={`${rule.name} display order`} type="number" min={1} step={1} value={rule.order} onChange={event => changeOrder(rule, event.target.value)} /></td><td><div className="mw-row-actions"><button aria-label={`Edit ${rule.name}`} onClick={() => edit(rule)}><Icon name="edit" size={20} /></button><button className="mw-delete" aria-label={`Delete ${rule.name}`} onClick={event => { deleteTriggerRef.current = event.currentTarget; setDeleting(rule); }}><Icon name="trash" size={20} /></button></div></td></tr>)}</tbody></table>{!visibleRules.length && <div className="mw-empty">No tax rules match your search and filters.</div>}</div>
      <div className="mw-pagination tax-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} tax rules</span><div><button aria-label="Previous tax rules page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: pages }, (_, index) => index + 1).filter(number => number === 1 || number === pages || Math.abs(number - currentPage) <= 1).map(number => <button key={number} aria-label={`Tax rules page ${number}`} className={number === currentPage ? 'is-active' : ''} aria-current={number === currentPage ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}<button aria-label="Next tax rules page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button><select aria-label="Tax rules per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={5}>5 / page</option><option value={20}>20 / page</option></select></div></div>
    </section><section className="mw-panel tax-editor" style={{ display: canCreate || (draft as unknown as { _dbId?: string })._dbId ? undefined : 'none' }} aria-labelledby="tax-editor-heading"><h2 id="tax-editor-heading">Add / Edit Tax Rule</h2>
      <div className="tax-editor-content"><form className="tax-form" id="tax-rule-form" onSubmit={save} noValidate>
        <div className="mw-form-row tax-identity"><Field label="Tax Name" required><input ref={nameRef} maxLength={100} value={draft.name} placeholder="Enter tax name" onChange={event => update('name', event.target.value)} /></Field><Field label="Tax Rate (%)" required><input type="number" min={0} max={100} step="0.01" value={draft.rate} onChange={event => update('rate', event.target.value)} /></Field></div>
        <div className="mw-form-row tax-scope-fields"><Field label="Applies To" required><select value={draft.appliesTo} onChange={event => update('appliesTo', event.target.value)}>{scopes.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="External Tax ID (POS)"><input value={draft.externalId} onChange={event => update('externalId', event.target.value)} /></Field></div>
        <Field label="Description"><textarea maxLength={500} value={draft.description} onChange={event => update('description', event.target.value)} /><small>{draft.description.length}/500</small></Field>
        <div className="mw-form-row tax-rounding-fields"><Field label="Rounding Type"><select value={draft.rounding} onChange={event => update('rounding', event.target.value as TaxRounding)}>{roundingTypes.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Display Order"><input type="number" min={1} step={1} value={draft.order} onChange={event => update('order', Number(event.target.value))} /></Field></div>
        <div className="tax-toggle-grid">{([['active', 'Active'], ['delivery', 'Apply on Delivery'], ['receipt', 'Show on Receipt'], ['takeaway', 'Apply on Takeaway']] as const).map(([key, label]) => <div key={key}><Toggle checked={draft[key]} label={label} onChange={() => update(key, !draft[key])} /><span>{label}</span></div>)}</div>
      </form><section className="mw-preview tax-preview" aria-label="Tax preview"><h3>Tax Preview</h3><div className="tax-preview-receipt" aria-live="polite"><div><span>Item Price</span><span>${preview.price.toFixed(2)}</span></div><div><span>Tax ({Number.isFinite(rate) ? rate.toFixed(2) : '0.00'}%)</span><span>${preview.tax.toFixed(2)}</span></div><div className="tax-preview-total"><strong>Total Price</strong><strong>${preview.total.toFixed(2)}</strong></div></div><div className="tax-preview-note"><InfoIcon /><p>{draft.active ? `This tax will be applied to ${draft.appliesTo.toLowerCase()}.` : 'This tax rule is inactive and will not be applied.'}</p></div></section></div>
      <div className="mw-editor-actions tax-editor-actions"><button type="button" className="mw-button" onClick={() => { const original = rules.find(rule => rule.id === draft.id) || rules[0]; if (original) edit(original); else add(); setNotice('Changes cancelled.'); }}>Cancel</button><button type="submit" form="tax-rule-form" className="mw-button mw-primary">Save Tax Rule</button></div>
    </section></div>
    {deleting && <div className="mw-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeDelete(); }}><section className="mw-modal" role="dialog" aria-modal="true" aria-labelledby="delete-tax-rule-title" onKeyDown={dialogKeys}><h2 id="delete-tax-rule-title">Delete tax rule?</h2><p>Remove “{deleting.name}” from this demo session?</p><div><button ref={cancelDeleteRef} className="mw-button" onClick={closeDelete}>Cancel</button><button className="mw-button mw-danger" onClick={remove}>Delete Tax Rule</button></div></section></div>}
  </div>;
}
