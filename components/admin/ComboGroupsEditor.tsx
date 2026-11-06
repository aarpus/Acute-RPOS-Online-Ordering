'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { comboGroupError, comboOptionError, normalizeComboGroup, type ComboGroup, type ComboOption } from '../../lib/combo-master';
import { Field, Icon, Toggle } from './MenuControls';
import './combo-groups.css';
import { useLegacyMenu } from './legacy-menu-client';

type CatalogItem = { id: string; name: string; image: string };
type Props = { groups: ComboGroup[]; catalog: CatalogItem[]; saved: boolean; error: string; onEdit: () => void; onSave: (groups: ComboGroup[]) => Promise<boolean> };

export default function ComboGroupsEditor({ groups, catalog, saved, error, onEdit, onSave }: Props) {
  const menu = useLegacyMenu();
  const [groupDraft, setGroupDraft] = useState<ComboGroup | null>(null);
  const [optionDraft, setOptionDraft] = useState<{ groupId: number; value: ComboOption } | null>(null);
  const [deleting, setDeleting] = useState<{ groupId: number; optionId?: number } | null>(null);
  const [localError, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const modalOpen = !!(groupDraft || optionDraft || deleting);
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    firstInput.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [modalOpen]);
  function close() { if (busy) return; setGroupDraft(null); setOptionDraft(null); setDeleting(null); setError(''); opener.current?.focus(); }
  function trap(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'));
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function openGroup(group?: ComboGroup) {
    onEdit();
    opener.current = document.activeElement as HTMLElement; setError('');
    setGroupDraft(group ? structuredClone(group) : { id:Date.now(), name:'', externalId:'', selectionType:'selectable', min:1, max:1, required:true, order:Math.max(0,...groups.map(row=>row.order))+1, options:[] });
  }
  function openOption(group: ComboGroup, option?: ComboOption) {
    onEdit();
    opener.current = document.activeElement as HTMLElement; setError('');
    const item = catalog.find(item => !group.options.some(row=>row.itemId===item.id));
    setOptionDraft({ groupId:group.id, value:option ? structuredClone(option) : { id:Date.now(), itemId:item?.id || '', name:item?.name || '', externalId:'', quantity:1, extraPrice:null, isDefault:false, available:true, order:Math.max(0,...group.options.map(row=>row.order))+1 } });
  }
  async function persist(next: ComboGroup[]) {
    setBusy(true); setError('');
    try {
      if (await onSave(next.map(normalizeComboGroup))) { setGroupDraft(null); setOptionDraft(null); setDeleting(null); opener.current?.focus(); }
      else setError('Could not save. Check the Combo Master name, category and prices, then try again.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save. Please retry.'); }
    finally { setBusy(false); }
  }
  async function saveGroup(event: FormEvent) {
    event.preventDefault(); if (!groupDraft || busy) return;
    const group = normalizeComboGroup({ ...groupDraft, name:groupDraft.name.trim() });
    const problem = comboGroupError(group,groups);
    if (problem) { setError(problem); return; }
    await persist(groups.some(row=>row.id===group.id) ? groups.map(row=>row.id===group.id?group:row) : [...groups,group]);
  }
  async function saveOption(event: FormEvent) {
    event.preventDefault(); if (!optionDraft || busy) return;
    const group = groups.find(row=>row.id===optionDraft.groupId);
    if (!group) { setError('This group is unavailable. Close this dialog and select a saved group.'); return; }
    const option = { ...optionDraft.value, name:optionDraft.value.name.trim() };
    if (!catalog.some(item=>item.id===option.itemId)) { setError('Choose an available regular menu item.'); return; }
    const problem = comboOptionError(option,group);
    if (problem) { setError(problem); return; }
    const options = group.options.some(row=>row.id===option.id) ? group.options.map(row=>row.id===option.id?option:row) : [...group.options,option];
    await persist(groups.map(row=>row.id===group.id?{...group,options}:row));
  }
  async function remove() {
    if (!deleting || busy) return;
    const next = deleting.optionId === undefined ? groups.filter(row=>row.id!==deleting.groupId) : groups.map(group=>group.id===deleting.groupId ? {...group,options:group.options.filter(option=>option.id!==deleting.optionId)} : group);
    await persist(next);
  }
  return <section className="combo-groups-editor">
    <div className="combo-groups-heading"><div><h3>Combo Groups</h3><p className="mw-help">Create a group, set how many items customers can pick, then add its options.</p></div><button type="button" className="mw-button mw-primary" disabled={!saved || busy} style={{ display: menu.canCreate('combo-groups') ? undefined : 'none' }} onClick={()=>openGroup()}><Icon name="plus" size={16}/>Add Group</button></div>
    {!saved && <p data-notice-tone="info">Save the Combo Master details first, then create groups and options.</p>}
    {saved && !groups.length && <p className="mw-empty">No groups yet. Add a group such as “Choose your sides”.</p>}
    {groups.map(group=><section className="combo-group-panel" key={group.id}>
      <div className="combo-groups-heading"><div><h4>{group.name}</h4><p>{group.selectionType==='fixed'?'All available options included':`Pick ${group.min}–${group.max} options`} · {group.required?'Required':'Optional'}</p></div><div className="mw-row-actions"><button type="button" aria-label={`Edit ${group.name} group`} onClick={()=>openGroup(group)}><Icon name="edit" size={17}/></button><button type="button" className="mw-delete" aria-label={`Delete ${group.name} group`} onClick={()=>{onEdit();opener.current=document.activeElement as HTMLElement;setError('');setDeleting({groupId:group.id});}}><Icon name="trash" size={17}/></button></div></div>
      {group.options.filter(option=>option.available).length < group.min && <p data-notice-tone="warning">Add at least {group.min} available options to make this group orderable.</p>}
      <div className="combo-groups-heading"><strong>Options ({group.options.length})</strong><button type="button" className="mw-button mw-outline" disabled={busy} style={{ display: menu.canCreate('combo-options') ? undefined : 'none' }} onClick={()=>openOption(group)}><Icon name="plus" size={15}/>Add Option</button></div>
      <div className="mw-table-scroll"><table className="mw-table"><thead><tr><th>Option / Item</th><th>Quantity</th><th>Extra Price</th><th>Default</th><th>Status</th><th>Actions</th></tr></thead><tbody>{group.options.map(option=><tr key={option.id}><td><button type="button" className="mw-name" onClick={()=>openOption(group,option)}>{option.name}</button><small className="combo-option-item">{catalog.find(item=>item.id===option.itemId)?.name || 'Item unavailable'}</small></td><td>{option.quantity}</td><td>{option.extraPrice === null ? 'Item price × ' + option.quantity : '$' + option.extraPrice.toFixed(2)}</td><td>{option.isDefault?'Yes':'No'}</td><td>{option.available?'Active':'Inactive'}</td><td><div className="mw-row-actions"><button type="button" aria-label={`Edit ${option.name} option`} onClick={()=>openOption(group,option)}><Icon name="edit" size={16}/></button><button type="button" className="mw-delete" aria-label={`Delete ${option.name} option`} onClick={()=>{onEdit();opener.current=document.activeElement as HTMLElement;setError('');setDeleting({groupId:group.id,optionId:option.id});}}><Icon name="trash" size={16}/></button></div></td></tr>)}</tbody></table>{!group.options.length && <p className="mw-empty">Add options to this saved group.</p>}</div>
    </section>)}
    {modalOpen && <div className="mw-modal-backdrop" onClick={event=>{if(event.target===event.currentTarget)close();}}><section className="mw-modal combo-group-modal" role="dialog" aria-modal="true" aria-labelledby="combo-group-dialog-title" onKeyDown={trap}>
      <h2 id="combo-group-dialog-title">{groupDraft ? `${groupDraft._dbId?'Edit':'Add'} Combo Group` : optionDraft ? `${optionDraft.value._dbId?'Edit':'Add'} Combo Option` : `Delete ${deleting?.optionId === undefined?'group':'option'}?`}</h2>
      <form onSubmit={groupDraft?saveGroup:optionDraft?saveOption:event=>{event.preventDefault();void remove();}} noValidate>
        {groupDraft && <>
          <Field label="Group Name" required><input ref={firstInput} maxLength={150} value={groupDraft.name} onChange={event=>setGroupDraft({...groupDraft,name:event.target.value})}/></Field>
          <Field label="Selection Type"><select value={groupDraft.selectionType} onChange={event=>setGroupDraft({...groupDraft,selectionType:event.target.value as ComboGroup['selectionType'],min:1,max:1,required:true})}><option value="selectable">Customer chooses options</option><option value="fixed">All options included</option></select></Field>
          {groupDraft.selectionType==='selectable' && <><div className="mw-form-row"><Field label="Minimum Picks" required><input type="number" min={groupDraft.required?1:0} step={1} value={groupDraft.min} onChange={event=>setGroupDraft({...groupDraft,min:Number(event.target.value)})}/></Field><Field label="Maximum Picks" required><input type="number" min={Math.max(1,groupDraft.min)} step={1} value={groupDraft.max} onChange={event=>setGroupDraft({...groupDraft,max:Number(event.target.value)})}/></Field></div><label className="mw-switch-label"><Toggle label="Combo group required" checked={groupDraft.required} onChange={()=>setGroupDraft({...groupDraft,required:!groupDraft.required,min:groupDraft.required?0:Math.max(1,groupDraft.min)})}/>Required group</label></>}
          <div className="mw-form-row"><Field label="Display Order"><input type="number" min={1} step={1} value={groupDraft.order} onChange={event=>setGroupDraft({...groupDraft,order:Number(event.target.value)})}/></Field><Field label="External Group ID (POS)"><input maxLength={100} value={groupDraft.externalId} onChange={event=>setGroupDraft({...groupDraft,externalId:event.target.value})}/></Field></div>
        </>}
        {optionDraft && <>
          <Field label="Menu Item" required><select value={optionDraft.value.itemId} onChange={event=>{const item=catalog.find(item=>item.id===event.target.value);setOptionDraft({...optionDraft,value:{...optionDraft.value,itemId:event.target.value,name:item?.name||''}});}}><option value="">Choose a regular item</option>{catalog.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Option Name" required><input ref={firstInput} maxLength={150} value={optionDraft.value.name} onChange={event=>setOptionDraft({...optionDraft,value:{...optionDraft.value,name:event.target.value}})}/></Field>
          <div className="mw-form-row"><Field label="Included Quantity"><input type="number" min={.001} step={.001} value={optionDraft.value.quantity} onChange={event=>setOptionDraft({...optionDraft,value:{...optionDraft.value,quantity:Number(event.target.value)}})}/></Field><Field label="Extra Price"><input type="number" min={0} step="0.01" placeholder="Use item price" value={optionDraft.value.extraPrice ?? ''} onChange={event=>setOptionDraft({...optionDraft,value:{...optionDraft.value,extraPrice:event.target.value === '' ? null : Number(event.target.value)}})}/><small>Blank uses the actual item price × quantity. Enter 0 for no extra charge.</small></Field></div>
          <div className="mw-form-row"><Field label="Display Order"><input type="number" min={1} step={1} value={optionDraft.value.order} onChange={event=>setOptionDraft({...optionDraft,value:{...optionDraft.value,order:Number(event.target.value)}})}/></Field><Field label="External Option ID (POS)"><input maxLength={100} value={optionDraft.value.externalId} onChange={event=>setOptionDraft({...optionDraft,value:{...optionDraft.value,externalId:event.target.value}})}/></Field></div>
          {groups.find(group=>group.id===optionDraft.groupId)?.selectionType === 'fixed' ? <p className="mw-help">All active options are automatically included in this group.</p> : <label className="mw-switch-label"><Toggle label="Combo option default" checked={optionDraft.value.isDefault} onChange={()=>setOptionDraft({...optionDraft,value:{...optionDraft.value,isDefault:!optionDraft.value.isDefault}})}/>Default selection</label>}<label className="mw-switch-label"><Toggle label="Combo option active" checked={optionDraft.value.available} onChange={()=>setOptionDraft({...optionDraft,value:{...optionDraft.value,available:!optionDraft.value.available}})}/>Active option</label>
        </>}
        {deleting && <p>This removes the {deleting.optionId===undefined?'group and all its options':'option'} from this combo. The menu items remain available.</p>}
        {(localError||error) && <p data-notice-tone="error" role="alert">{error||localError}</p>}
        <div className="mw-editor-actions"><button type="button" className="mw-button" autoFocus={!!deleting} disabled={busy} onClick={close}>Cancel</button><button type="submit" className={`mw-button ${deleting?'mw-danger':'mw-primary'}`} disabled={busy}>{busy?'Saving…':groupDraft?'Save Group':optionDraft?'Save Option':'Delete'}</button></div>
      </form>
    </section></div>}
  </section>;
}
