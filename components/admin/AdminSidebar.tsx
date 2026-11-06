import AdminIcon from './AdminIcon';
import { adminNavigation } from '../../lib/admin-navigation';
import './admin-sidebar.css';

export default function AdminSidebar({ active, open, onSelect }: { active: string; open: boolean; onSelect: (label: string) => void }) {
  return <aside className={`admin-sidebar fixed bottom-0 left-0 top-[58px] z-20 overflow-y-auto text-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}><nav aria-label="Admin navigation">{adminNavigation.map(({ icon, label }) => <button type="button" key={label} aria-current={active === label ? 'page' : undefined} onClick={() => onSelect(label)} className="relative flex w-full flex-col items-center px-1 py-3 transition hover:bg-white/10">{active === label && <span className="absolute inset-y-0 left-0 w-1 bg-[#f5b82e]" />}<AdminIcon name={icon} className={active === label ? 'text-[#f5b82e]' : 'text-white'} />{label}</button>)}</nav></aside>;
}
