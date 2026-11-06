import type { getStorefront } from '../lib/storefront';

export default function HeroBanner({ hero }: { hero: Awaited<ReturnType<typeof getStorefront>>['hero'] }) {
  return (
    <section className="relative overflow-hidden bg-red-950 text-white" style={{ color: hero.textColor, textAlign: hero.alignment }}>
      <img
        src={hero.image}
        alt={hero.imageAlt}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black" style={{ opacity: hero.overlayOpacity / 100 }} />
      <div className="relative mx-auto max-w-6xl px-6 py-10 sm:py-12">
        <p className="mb-3 text-xs leading-6 tracking-widest whitespace-pre-line uppercase">
          {hero.eyebrow}
        </p>
        {hero.subtitle && <p className="mb-3 text-xs leading-6">{hero.subtitle}</p>}
        <h1 className="font-serif text-3xl leading-tight font-bold whitespace-pre-line sm:text-5xl">
          {hero.title}
        </h1>
      </div>
    </section>
  );
}
