import type { HomeData } from '../data/home';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import StoreLogo from './StoreLogo';

type Props = {
  store: HomeData['store'];
  links: HomeData['header']['links'];
  navAlignment?: string;
  locations: { id: string; code: string; name: string }[];
  location: string;
  onLocationChange: (location: string) => void;
  cartCount: number;
  onCartClick: () => void;
};

export default function Header({ store, links, navAlignment = 'left', locations, location, onLocationChange, cartCount, onCartClick }: Props) {
  const selectedName = locations.find(option => option.code === location)?.name || '';
  const [locationOpen, setLocationOpen] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!locationRef.current?.contains(event.target as Node)) setLocationOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setLocationOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="border-b border-red-800 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-5 sm:px-5">
        <StoreLogo store={store} />

        <nav aria-label="Main navigation" className={`ml-2 hidden min-w-0 flex-1 flex-wrap gap-x-8 gap-y-2 md:ml-6 md:flex ${navAlignment === 'center' ? 'justify-center' : navAlignment === 'right' ? 'justify-end' : 'justify-start'}`}>
          {links.map((link) => (
            <Link key={link.label} href={link.href.startsWith('#') ? '/' + link.href : link.href} className="hover:text-red-700">
              {link.label}
            </Link>
          ))}
        </nav>

        <div ref={locationRef} className="relative ml-auto">
          <button
            type="button"
            aria-label={`Your store: ${selectedName || 'Select store'}`}
            aria-haspopup="listbox"
            aria-expanded={locationOpen}
            onClick={() => setLocationOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-stone-50 sm:gap-3 sm:px-3"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0 text-red-700" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span className="min-w-0 block">
              <span className="block text-xs text-stone-500">Your store</span>
              <span className="block max-w-28 truncate text-sm font-medium text-stone-900">{selectedName || 'Select store'}</span>
            </span>
            <svg aria-hidden="true" viewBox="0 0 20 20" className={`hidden size-4 text-stone-700 transition-transform sm:block ${locationOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 7 5 5 5-5" />
            </svg>
          </button>

          {locationOpen && (
            <div className="absolute right-0 top-full z-30 mt-3 w-64 overflow-hidden rounded-xl border border-stone-100 bg-white shadow-xl sm:w-72">
              <p className="border-b border-stone-100 px-4 py-3 text-sm text-stone-500">Select store</p>
              <div role="listbox" aria-label="Select store">
                {locations.map((option) => {
                  const selected = option.code === location;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onLocationChange(option.code);
                        setLocationOpen(false);
                      }}
                      className="flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3.5 text-left text-sm last:border-b-0 hover:bg-stone-50"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className={`size-6 shrink-0 ${selected ? 'text-red-700' : 'text-stone-400'}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                      <span className="flex-1 text-stone-900">{option.name}</span>
                      {selected && (
                        <svg aria-label="Selected" viewBox="0 0 20 20" className="size-5 text-red-700" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m4 10 4 4 8-8" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Link href="/account" aria-label="My account" className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-red-700 hover:bg-stone-50 hover:text-red-600">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="7" r="4" /><path d="M4 21v-3a8 8 0 0 1 16 0v3Z" /></svg>
        </Link>
        <button
          onClick={onCartClick}
          className="relative flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-gray-50"
          aria-label={`Open cart, ${cartCount} items`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 2h3l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L22 7H5" />
          </svg>
          <span className="absolute -right-0.5 -top-0.5 flex min-h-6 min-w-6 items-center justify-center rounded-full bg-red-700 px-1 text-xs font-semibold text-white">
            {cartCount}
          </span>
        </button>
      </div>
    </header>
  );
}
