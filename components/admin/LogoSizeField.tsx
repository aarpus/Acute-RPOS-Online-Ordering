'use client';

export default function LogoSizeField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const valid = Number.isInteger(value) && value >= 24 && value <= 400;
  return <div className="mt-3">
    <label className="block text-[11px] font-semibold text-[#183f70]">
      Logo Width (px)
      <input aria-label="Logo Width (px)" aria-invalid={!valid} type="number" min="24" max="400" step="1" value={value || ''} onChange={event => onChange(Number(event.target.value))} className={`mt-1 w-full rounded border px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-[#183f70] ${valid ? 'border-slate-200' : 'border-red-400'}`} />
    </label>
    <p className={`mt-1 text-[10px] ${valid ? 'text-slate-400' : 'text-red-600'}`}>24–400px. Height adjusts automatically.</p>
  </div>;
}
