'use client';

import { useEffect, useRef, useState } from 'react';
import type { Product } from '../data/home';
import { useStore } from './StoreProvider';
import { validateCatalogCart } from '../lib/menu-public';
import { applyDocumentSeo } from '../lib/client-seo';

export default function ProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem, formatPrice, data } = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [sizeId, setSizeId] = useState(product.sizes[0].id);
  const [extraIds, setExtraIds] = useState<string[]>((product.optionGroups ?? []).filter(group => !group.variantId || group.variantId === product.sizes[0].id).flatMap(group => group.defaults));
  const [instructions, setInstructions] = useState('');
  const [quantity, setQuantity] = useState(product.minimumQuantity ?? 1);
  const [error, setError] = useState('');
  const [image, setImage] = useState(0);
  const size = product.sizes.find((size) => size.id === sizeId)!;
  const total = (size.price + product.extras.filter((extra) => extraIds.includes(extra.id)).reduce((sum, extra) => sum + extra.price, 0)) * quantity;

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { const seo = data.seo.find(row => row.targetType === 'item' && row.targetId === product.id); if (seo) return applyDocumentSeo(seo); }, [data.seo, product.id]);
  function addToCart() {
    const id = JSON.stringify([product.id, sizeId, [...extraIds].sort(), instructions.trim()]);
    try { validateCatalogCart([{ id, product, sizeId, extraIds, instructions: instructions.trim(), quantity }]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your selections.'); return; }
    addItem({ id, product, sizeId, extraIds, instructions: instructions.trim(), quantity });
    onClose();
  }
  function changeSize(id: string) { setSizeId(id); setExtraIds((product.optionGroups ?? []).filter(group => !group.variantId || group.variantId === id).flatMap(group => group.defaults)); setError(''); }
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="product-title" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl backdrop:bg-black/50 sm:p-5">
      <button aria-label="Close customization" onClick={onClose} className="absolute top-2 right-3 z-10 rounded-full bg-white px-2 py-1 text-xl text-gray-500">×</button>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="relative">
            <img src={product.gallery[image]} alt={product.name} className="h-64 w-full rounded-lg object-cover md:h-96" />
            {product.popular && <span className="absolute top-3 left-3 rounded-full bg-red-700 px-3 py-1 text-xs text-white">★ Bestseller</span>}
            {product.gallery.length > 1 && <><button aria-label="Previous photo" onClick={() => setImage((image + product.gallery.length - 1) % product.gallery.length)} className="absolute top-1/2 left-3 rounded-full bg-white px-3 py-1">‹</button><button aria-label="Next photo" onClick={() => setImage((image + 1) % product.gallery.length)} className="absolute top-1/2 right-3 rounded-full bg-white px-3 py-1">›</button></>}
          </div>
          <div className="mt-3 flex justify-center gap-3">{product.gallery.map((src, index) => <button key={src} aria-label={`View photo ${index + 1}`} aria-pressed={image === index} onClick={() => setImage(index)} className={`overflow-hidden rounded-lg border-2 ${image === index ? 'border-red-700' : 'border-transparent'}`}><img src={src} alt="" className="h-16 w-24 object-cover" /></button>)}</div>
        </div>
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-3 pr-8"><h2 id="product-title" className="font-serif text-2xl font-bold">{product.name}</h2><strong className="text-xl text-red-700">{formatPrice(size.price)}</strong></div>
          <p className="mt-2 text-sm leading-6 text-gray-600">{product.description}</p>
          <fieldset className="mt-5"><legend className="mb-2 font-serif text-lg font-bold">Choose a Size <span className="font-sans text-sm font-normal text-red-700">(Required)</span></legend><div className="overflow-hidden rounded-lg border border-gray-200">{product.sizes.map((size) => <label key={size.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-0 has-checked:bg-red-50"><input type="radio" name="size" value={size.id} checked={sizeId === size.id} onChange={() => changeSize(size.id)} className="accent-red-700" /><span className="flex-1">{size.name}</span><strong>{formatPrice(size.price)}</strong></label>)}</div></fieldset>
          {(product.optionGroups ?? []).filter(group => !group.variantId || group.variantId === sizeId).map(group => <fieldset className="mt-5" key={group.id}><legend className="font-serif text-lg font-bold">{group.name} <span className="text-sm font-normal">(Choose {group.min}?{group.max})</span></legend>{product.extras.filter(extra => group.options.includes(extra.id)).map(extra => <label key={extra.id} className="mt-2 flex items-center gap-3 text-sm"><input type="checkbox" checked={extraIds.includes(extra.id)} onChange={event => { const next = event.target.checked ? group.max === 1 ? [...extraIds.filter(id => !group.options.includes(id)), extra.id] : [...extraIds, extra.id] : extraIds.filter(id => id !== extra.id); setExtraIds(next); setError(''); }} className="size-4 accent-red-700" /><span className="flex-1">{extra.name}</span><strong>+{formatPrice(extra.price)}</strong></label>)}</fieldset>)}
          <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>
          {product.allowSpecialInstructions !== false && <label className="mt-5 block"><span className="font-serif text-lg font-bold">Special Instructions</span> <span className="text-sm text-gray-500">(Optional)</span><textarea maxLength={product.specialInstructionsMaxLength ?? 250} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="e.g. no onions, make it spicy, extra chutney…" className="mt-2 min-h-20 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label>}<p className="text-right text-xs text-gray-400">{instructions.length}/{product.specialInstructionsMaxLength ?? 250}</p>
          <div className="mt-4 flex gap-3 md:mt-auto md:pt-5"><div className="flex items-center rounded-lg border border-gray-200"><button aria-label="Decrease quantity" disabled={quantity <= (product.minimumQuantity ?? 1)} onClick={() => setQuantity(quantity - 1)} className="px-3 py-2 disabled:opacity-30">−</button><span className="px-2">{quantity}</span><button aria-label="Increase quantity" disabled={quantity >= (product.maximumQuantity ?? 99)} onClick={() => setQuantity(quantity + 1)} className="px-3 py-2 disabled:opacity-30">+</button></div><button onClick={addToCart} className="flex-1 rounded-lg bg-red-700 px-3 py-3 font-semibold text-white hover:bg-red-800">Add to Cart · {formatPrice(total)}</button></div>
        </div>
      </div>
    </dialog>
  );
}
