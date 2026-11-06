export const menuSections = [
  { label: 'Items', view: 'items' },
  { label: 'Categories', view: 'categories' },
  { label: 'Variants', view: 'variants' },
  { label: 'Modifier Groups', view: 'modifier-groups' },
  { label: 'Combo Master', view: 'combo-items' },
  { label: 'Offers', view: 'offers' },
  { label: 'Tax Rules', view: 'tax-rules' },
  { label: 'Inventory', view: 'inventory' },
  { label: 'Schedules', view: 'schedules' },
  { label: 'Pricing', view: 'pricing' },
  { label: 'SEO & Meta', view: 'seo-meta' },
] as const;

export function menuSectionForView(view: string | null) {
  return menuSections.find(section => section.view === view)?.label ?? 'Items';
}

export function menuScreenHref(label: string) {
  const view = menuSections.find(section => section.label === label)?.view ?? 'items';
  return `/admin/menu?view=${view}`;
}
