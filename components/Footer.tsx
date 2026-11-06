import type { HomeData } from '../data/home';
import StoreLogo from './StoreLogo';

export default function Footer({ store, footer }: { store: HomeData['store']; footer: HomeData['footer'] }) {
  return (
    <footer id="contact" className="bg-neutral-900 text-white">
      <div className="mx-auto max-w-7xl px-5 py-6">
        <div className="grid items-center gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-[minmax(250px,1.55fr)_minmax(170px,1fr)_minmax(140px,0.9fr)_minmax(150px,0.9fr)_auto]">
          <StoreLogo store={store} />

          <div className="flex min-w-0 items-center gap-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span className="text-xs leading-5">{store.address}</span>
          </div>

          <div className="flex items-center gap-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3h4l2 5-2.5 1.5a15 15 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2Z" />
            </svg>
            <span className="text-xs leading-5">
              <span className="block font-semibold">Contact Us</span>
              <a href={`tel:${store.phone.replace(/[^+\d]/g, '')}`} className="hover:text-gray-300">{store.phone}</a>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span className="text-xs leading-5">
              <span className="block font-semibold">Store Time</span>
              <span className="whitespace-pre-wrap">{store.hours}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:col-span-2 lg:col-span-1 lg:justify-end">
            {footer.links.map((link, index) => (
              <details key={link.label} id={link.href.slice(1)} className="group relative">
                <summary className="cursor-pointer list-none whitespace-nowrap hover:text-gray-300 [&::-webkit-details-marker]:hidden">
                  {link.label}
                </summary>
                <p className="absolute right-0 z-10 mt-2 w-56 rounded bg-neutral-800 p-3 text-gray-300 shadow-lg">
                  Template preview. Store policy content will be added before launch.
                </p>
                {index < footer.links.length - 1 && <span aria-hidden="true" className="absolute -right-2 top-0 text-gray-500">|</span>}
              </details>
            ))}
          </div>
        </div>

        <details id="story" className="mt-5 text-sm text-gray-300">
          <summary className="cursor-pointer">Our Story</summary>
          <p className="mt-2">{footer.story}</p>
        </details>

        <div className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-gray-600 pt-4 text-xs text-gray-300 sm:flex-row sm:items-center">
          <p className="text-center sm:text-left">{footer.copyright}</p>
          <p className="text-center font-serif text-sm font-semibold text-white sm:text-right">{footer.closingLine}</p>
        </div>
      </div>
    </footer>
  );
}
