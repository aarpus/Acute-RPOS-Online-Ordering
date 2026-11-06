export default function MapPreview({ address }: { address: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-slate-50">
      <div className="relative h-36 overflow-hidden bg-[#eaf0e7]">
        <svg viewBox="0 0 600 180" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true"><path d="M0 30H600M0 90H600M0 150H600M80 0V180M220 0V180M440 0V180M560 0V180" stroke="white" strokeWidth="15" fill="none" /><path d="M0 180 600 0" stroke="#cbd5e1" strokeWidth="23" /><path d="M0 180 600 0" stroke="white" strokeWidth="16" /><path d="M470 0Q400 70 520 130T600 180V0Z" fill="#bfdbfe" /></svg>
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-red-700 p-3 text-xl text-white shadow-md" aria-hidden="true">⌖</span>
      </div>
      <div className="p-3"><p className="text-sm">{address}</p><p className="mt-1 text-xs text-gray-500">Illustrative address preview. Not a live map or driver location.</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-red-700 underline">Open address in Google Maps ↗</a></div>
    </div>
  );
}
