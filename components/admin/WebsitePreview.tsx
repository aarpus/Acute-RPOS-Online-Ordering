'use client';

import { useEffect, useRef, useState } from 'react';
import type { BrandSettings, Category } from './BrandingWorkspace';
import type { WebsitePreviewDraft } from '../../lib/website-preview';

export default function WebsitePreview({ settings, categories, storeCode, mobile, onMobileChange }: {
  settings: BrandSettings; categories: Category[]; storeCode: string;
  mobile: boolean; onMobileChange: (mobile: boolean) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const draft = useRef<WebsitePreviewDraft>({ type: 'website-preview:update', storeCode, settings, categories });
  draft.current = { type: 'website-preview:update', storeCode, settings, categories };

  function sendDraft() {
    frame.current?.contentWindow?.postMessage(draft.current, window.location.origin);
  }

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(sendDraft, [settings, categories, storeCode]);
  useEffect(() => {
    function onReady(event: MessageEvent) {
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'website-preview:ready') sendDraft();
    }
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  }, []);

  const viewport = mobile ? 390 : 1280;
  const scale = width ? Math.min(1, width / viewport) : 0;
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div><h2 className="text-base font-extrabold text-[#183f70]">Website Preview</h2><p className="text-[10px] text-slate-400">Live home page. Save changes to update your website.</p></div>
        <div className="flex rounded border border-slate-200 p-0.5 text-[10px] font-bold">
          {['Desktop', 'Mobile'].map((label, index) => <button key={label} type="button" aria-pressed={mobile === Boolean(index)} onClick={() => onMobileChange(Boolean(index))} className={`rounded px-3 py-1.5 ${mobile === Boolean(index) ? 'bg-[#183f70] text-white' : 'text-[#183f70]'}`}>{label}</button>)}
        </div>
      </div>
      <div ref={container} className={`mx-auto mt-3 overflow-hidden rounded border border-slate-200 bg-white ${mobile ? 'max-w-[320px]' : ''}`}>
        <div aria-hidden="true" className="flex h-5 items-center gap-1 bg-slate-100 px-2"><i className="h-1.5 w-1.5 rounded-full bg-red-400" /><i className="h-1.5 w-1.5 rounded-full bg-amber-400" /><i className="h-1.5 w-1.5 rounded-full bg-emerald-400" /><span className="ml-2 h-2 flex-1 rounded bg-slate-200" /></div>
        <div className="relative h-[560px]">
          {storeCode && scale > 0 && <iframe key={storeCode} ref={frame} title={`${mobile ? 'Mobile' : 'Desktop'} home page preview`} src={`/?website-preview=1&store_code=${encodeURIComponent(storeCode)}`} onLoad={sendDraft} className="absolute left-0 top-0 border-0 bg-white" style={{ width: viewport, height: 560 / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }} />}
        </div>
      </div>
      {storeCode && <a href={`/?store_code=${encodeURIComponent(storeCode)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-semibold text-[#183f70] underline">Open saved website</a>}
    </section>
  );
}
