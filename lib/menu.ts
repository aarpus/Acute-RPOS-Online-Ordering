import type { Product } from '../data/home';

type CatalogCategory = { id: string; name: string };
export type MenuCategory = CatalogCategory & { menuCategoryId: string | null };

// Website categories have database UUIDs; the current catalog uses named keys.
// Prefer a matching POS category key, then match the existing catalog name.
export function resolveMenuCategory(externalId: string | null, name: string, catalog: CatalogCategory[]) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const external = externalId ? catalog.find(c => normalize(c.id) === normalize(externalId)) : undefined;
  return (external ?? catalog.find(c => normalize(c.name) === normalize(name)))?.id ?? null;
}

export function filterMenuProducts(products: Product[], category: MenuCategory | null, search: string) {
  const query = search.trim().toLowerCase();
  return products.filter(product => {
    const key = category?.menuCategoryId;
    const matches = !category || key === 'all' || (key === 'popular' ? product.popular : key != null && (product.categoryIds ?? [product.categoryId]).includes(key));
    return matches && `${product.name} ${product.description}`.toLowerCase().includes(query);
  });
}
