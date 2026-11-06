'use client';

import { useEffect, useState } from 'react';
import type { Product } from '../data/home';
import { useStore } from '../components/StoreProvider';
import HeroBanner from '../components/HeroBanner';
import SpecialOffers from '../components/SpecialOffers';
import OrderControls from '../components/OrderControls';
import CategoryNav from '../components/CategoryNav';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import { filterMenuProducts } from '../lib/menu';
import { applyDocumentSeo } from '../lib/client-seo';

export default function HomePage() {
  const { data, mode, setMode, formatPrice } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>('all');
  const [product, setProduct] = useState<Product | null>(null);
  useEffect(() => { const seo = data?.seo.find(row => row.targetType === 'category' && row.targetId === category); if (seo) return applyDocumentSeo(seo); }, [data?.seo, category]);
  if (!data) return null;

  const selectedCategory = data.categories.find(item => item.id === category) ?? null;
  const products = filterMenuProducts(data.products, selectedCategory, search);
  const title = search ? 'Search Results' : selectedCategory?.name || 'All Dishes';

  function selectCategory(id: string) {
    setCategory(id);
    setSearch('');
    document.getElementById('menu')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  return (
    <main>
      <HeroBanner hero={data.hero} />
      <div className="mx-auto max-w-7xl px-5 pb-7">
        <OrderControls mode={mode} address={data.store.address} search={search} onModeChange={setMode} onSearchChange={setSearch} />
        <CategoryNav categories={data.categories} selected={selectedCategory?.id || 'all'} onSelect={selectCategory} />
        <div className="home-special-offers">
          <SpecialOffers key={data.store.code} offers={data.offers} formatPrice={formatPrice} onOrder={offer => {
            selectCategory(offer.categoryId);
            if (offer.itemIds.length === 1) {
              const item = data.products.find(item => item.id === offer.itemIds[0]);
              if (item) setProduct(item);
            }
          }} />
        </div>
        <section id="menu" aria-labelledby="menu-heading" aria-live="polite" className="scroll-mt-4 pt-4">
          <div className="mb-3 flex items-center justify-between"><h2 id="menu-heading" className="font-serif text-2xl font-bold sm:text-3xl">{title}</h2><button onClick={() => { setCategory('all'); setSearch(''); }} className="text-sm font-semibold text-red-700">See All →</button></div>
          <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2 lg:grid-cols-4">{products.map((product) => <ProductCard key={product.id} product={product} formatPrice={formatPrice} onAdd={setProduct} />)}</div>
          {products.length === 0 && <p className="py-12 text-center text-gray-500">No dishes found. Try another category or search.</p>}
        </section>
      </div>
      {product && <ProductModal key={product.id} product={product} onClose={() => setProduct(null)} />}
    </main>
  );
}
