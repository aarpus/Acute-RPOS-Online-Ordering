'use client';

import { useEffect, useState } from 'react';

export default function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const valid = /^#[0-9A-Fa-f]{6}$/.test(value);
  return <label className="flex items-center gap-2 text-[11px] font-semibold text-[#183f70]"><span className="w-24 shrink-0">{label}</span>{mounted ? <input aria-label={`${label} swatch`} type="color" value={valid ? value : '#ffffff'} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-8 w-8 cursor-pointer rounded border border-slate-200 bg-white p-0.5" /> : <span aria-hidden="true" className="h-8 w-8 rounded border border-slate-200 bg-slate-100" />}<input aria-label={`${label} hex`} value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} className={`h-8 min-w-0 flex-1 rounded border px-2 text-[11px] text-slate-600 outline-none ${valid ? 'border-slate-200' : 'border-red-400 bg-red-50'}`} placeholder="#FFFFFF" />{!valid && <span className="text-[10px] text-red-600">HEX</span>}</label>;
}
