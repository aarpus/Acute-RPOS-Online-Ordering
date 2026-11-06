'use client';

import { useEffect, useRef, useState } from 'react';
import type { publicMenu } from '../lib/menu-public';
import './special-offers.css';

type Offer = Awaited<ReturnType<typeof publicMenu>>['offers'][number];

function TagIcon() {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 8h21l16 16-19 19L6 25V8Z" fill="currentColor" /><circle cx="15" cy="16" r="3" fill="white" /><path d="m23 20 9 10m-1-12-10 14" stroke="white" strokeWidth="3" strokeLinecap="round" /></svg>;
}

export default function SpecialOffers({ offers, formatPrice, onOrder }: { offers: Offer[]; formatPrice: (value: number) => string; onOrder: (offer: Offer) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [positions, setPositions] = useState(offers.length);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () => {
      const first = element.children[0] as HTMLElement | undefined;
      const second = element.children[1] as HTMLElement | undefined;
      const step = first && second ? second.offsetLeft - first.offsetLeft : element.clientWidth;
      setPositions(Math.max(1, Math.round((element.scrollWidth - element.clientWidth) / Math.max(1, step)) + 1));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [offers]);
  if (!offers.length) return null;
  const multiple = offers.length > 3;
  function goTo(index: number) {
    const element = track.current;
    const card = element?.children[index] as HTMLElement | undefined;
    if (!element || !card) return;
    element.scrollTo({ left: card.offsetLeft - (element.children[0] as HTMLElement).offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function move(direction: number) {
    const element = track.current;
    if (!element) return;
    if (direction > 0 && element.scrollLeft >= element.scrollWidth - element.clientWidth - 4) goTo(0);
    else if (direction < 0 && element.scrollLeft <= 4) goTo(positions - 1);
    else goTo(Math.max(0, Math.min(positions - 1, active + direction)));
  }
  return <section className={`special-offers special-offers--${offers.length === 1 ? 'single' : multiple ? 'carousel' : offers.length}`} aria-label="Special offers">
    {offers.length > 1 && <div className="special-offers-heading"><span className="offer-heading-rays" aria-hidden="true">╲</span><TagIcon /><div><h2>Special Offers</h2>{offers.length >= 3 && <p>{multiple ? 'Discover more exciting deals & savings' : 'Enjoy exclusive deals on your favorite food'}</p>}</div><span className="offer-heading-rays" aria-hidden="true">╱</span></div>}
    <div className="special-offers-body">
      {multiple && <button className="offers-arrow offers-arrow--previous" onClick={() => move(-1)} aria-label="Previous offers">‹</button>}
      <div ref={track} className="special-offers-track" onScroll={() => {
        const element = track.current;
        if (!element) return;
        const first = element.children[0] as HTMLElement;
        const second = element.children[1] as HTMLElement | undefined;
        const step = second ? second.offsetLeft - first.offsetLeft : element.clientWidth;
        setActive(Math.min(positions - 1, Math.max(0, Math.round(element.scrollLeft / Math.max(1, step)))));
      }}>
        {offers.map((offer, index) => <article key={offer.id} className={`special-offer-card special-offer-card--${index % 4} ${offer.image ? 'special-offer-card--uploaded' : ''}`}>
          {offer.image ? <img className="special-offer-banner" src={offer.image} alt={offer.name} /> : <>
            <div className="special-offer-glow" aria-hidden="true" />
            <img className="special-offer-food" src={offer.productImage} alt="" />
          </>}
          <div className="special-offer-copy">
            <h3>{offers.length === 1 ? 'Special Offer' : offer.name}</h3>
            <p className="special-offer-value">{['percentage', 'category_discount', 'product_discount', 'variant_discount'].includes(offer.type) ? <>Flat <strong>{offer.value}%</strong> OFF</> : offer.type === 'free_delivery' ? <strong>FREE DELIVERY</strong> : ['bogo', 'buy_x_get_y'].includes(offer.type) ? <strong>BUY {offer.buyQty} GET {offer.getQty} FREE</strong> : offer.value > 0 ? <><strong>{formatPrice(offer.value)}</strong> OFF</> : <strong>{offer.name}</strong>}</p>
            <p className="special-offer-scope">{offer.type === 'free_delivery' ? 'On eligible orders' : `On ${offer.scope}`}</p>
            {(offer.code || offer.minimum > 0) && <p className="special-offer-terms">{[offer.code && `Code: ${offer.code}`, offer.minimum > 0 && `Min. ${formatPrice(offer.minimum)}`, offer.maxDiscount > 0 && `Up to ${formatPrice(offer.maxDiscount)}`].filter(Boolean).join(' · ')}</p>}
            <button className="special-offer-order" onClick={() => onOrder(offer)}>Order Now <span aria-hidden="true">➜</span></button>
          </div>
        </article>)}
      </div>
      {multiple && <button className="offers-arrow offers-arrow--next" onClick={() => move(1)} aria-label="Next offers">›</button>}
    </div>
    {multiple && <div className="offers-dots" aria-label="Choose an offer">{offers.slice(0, positions).map((offer, index) => <button key={offer.id} className={active === index ? 'is-active' : ''} aria-label={`Show offers from ${offer.name}`} aria-pressed={active === index} onClick={() => goTo(index)} />)}</div>}
  </section>;
}
