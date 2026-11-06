'use client';

import { useState } from 'react';
import { stageImage } from './branding-client';

type ImageUploadProps = { label: string; value: string; onChange: (value: string) => void; accept?: string; helper?: string; compact?: boolean };

export default function ImageUpload({ label, value, onChange, accept = 'image/png,image/jpeg,image/webp', helper = 'PNG, JPG or WebP · Max 2MB', compact = false }: ImageUploadProps) {
  const [failedImage, setFailedImage] = useState('');
  const [error, setError] = useState('');
  function handleFile(file?: File) {
    if (!file) return;
    setError('');
    try { onChange(stageImage(file)); } catch (error) { setError((error as Error).message); }
  }
  return <div className="min-w-0">
    <p className="text-xs font-bold text-[#183f70]">{label}</p>
    <div className={`mt-2 flex w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-3 ${compact ? 'h-24' : 'h-28'}`}>
      {value && failedImage !== value
        ? <img src={value} alt={`${label} preview`} onError={() => setFailedImage(value)} className="h-full w-full object-contain" />
        : <span className="text-center text-[10px] text-slate-400">{value ? 'Image unavailable. Please upload again.' : 'No image selected'}</span>}
    </div>
    <label className={`mt-2 inline-flex cursor-pointer items-center justify-center rounded-md border border-[#183f70] bg-white px-3 py-2 text-[11px] font-bold text-[#183f70] hover:bg-blue-50 ${compact ? 'w-full' : ''}`}>
      <span>{value ? 'Replace Image' : 'Upload Image'}</span>
      <input type="file" accept={accept} onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = ''; }} className="hidden" />
    </label>
    {helper && <p className="mt-1 text-[10px] leading-4 text-slate-400">{helper}</p>}
    {error && <p data-notice-tone="error" role="alert" className="mt-1 text-[10px] text-red-600">{error}</p>}
  </div>;
}
