// Shared by the Super Admin settings, menu screens, and API enforcement.
export const menuCreateSections: Record<string, string> = {
  items: 'Items', categories: 'Categories', variants: 'Variants',
  'modifier-groups': 'Modifier Groups', 'modifier-options': 'Modifier Options',
  'modifier-links': 'Item Modifier Groups', 'combo-items': 'Combo Master',
  'combo-groups': 'Combo Groups', 'combo-options': 'Combo Options',
  offers: 'Offers', 'tax-rules': 'Tax Rules', images: 'Images',
  inventory: 'Inventory', schedules: 'Schedules', pricing: 'Pricing', 'seo-meta': 'SEO & Meta',
};
export function canCreateMenuRecord(posEnabled: boolean, visibility: unknown, resource: string) {
  if (!posEnabled) return true;
  const settings = visibility && typeof visibility === 'object' && !Array.isArray(visibility) ? visibility as Record<string, unknown> : {};
  return settings[resource] !== false;
}

export function canViewMenuEditorTab(tab: string, allowed: (resource: string) => boolean) {
  const resources: Record<string, string[]> = {
    'Variants / Sizes': ['variants'], 'Modifiers / Add-ons': ['modifier-groups', 'modifier-options', 'modifier-links'],
    'Combo Options': ['combo-options'], 'Combo Groups': ['combo-groups', 'combo-options'],
    Images: ['images'], Inventory: ['inventory'], Schedule: ['schedules'], Pricing: ['pricing'], 'SEO & Meta': ['seo-meta'],
  };
  return (resources[tab] ?? []).every(allowed);
}
