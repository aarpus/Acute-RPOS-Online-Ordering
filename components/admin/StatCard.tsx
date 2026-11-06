import AdminIcon, { type AdminIconName } from './AdminIcon';
export default function StatCard({ label, value, trend, icon, negative = false }: { label: string; value: string; trend: string; icon: AdminIconName; negative?: boolean }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">{label}</p><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#fff4cf] text-[#183f70]"><AdminIcon name={icon} className="h-4 w-4" /></span></div><p className="mt-4 text-3xl font-extrabold text-[#152033]">{value}</p><p className={`mt-2 text-[11px] font-bold ${negative ? 'text-red-600' : 'text-emerald-600'}`}>{negative ? '↓ ' : '↑ '}{trend}</p></div>;
}
