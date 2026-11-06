export type ComboOption = {
  id: number; _dbId?: string; _updatedAt?: string; itemId: string; name: string;
  quantity: number; extraPrice: number | null; isDefault: boolean; available: boolean; order: number; externalId: string;
};
export type ComboGroup = {
  id: number; _dbId?: string; _updatedAt?: string; name: string; externalId: string;
  selectionType: 'fixed' | 'selectable'; min: number; max: number; required: boolean; order: number; options: ComboOption[];
};

export function comboGroupError(group: ComboGroup, groups: ComboGroup[]): string {
  if (!group.name.trim()) return 'Enter a combo group name.';
  if (group.name.trim().length > 150) return 'Group name must be 150 characters or fewer.';
  if (groups.some(row => row.id !== group.id && row.name.trim().toLowerCase() === group.name.trim().toLowerCase())) return 'A group with this name already exists in this combo.';
  if (![group.min, group.max, group.order].every(Number.isInteger) || group.min < 0 || group.max < 0 || group.max < group.min || group.order < 1) return 'Use whole numbers. Maximum picks must be at least minimum picks, and display order must be 1 or more.';
  if (group.selectionType === 'selectable' && (group.max < 1 || group.required && group.min < 1)) return 'Set maximum picks to 1 or more. Required groups need at least 1 minimum pick.';
  if (group.selectionType === 'selectable' && !group.required && group.min > 0) return 'Optional groups must have 0 minimum picks. Enable Required to set a higher minimum.';
  if (group.selectionType === 'selectable' && group.options.filter(option => option.available && option.isDefault).length > group.max) return 'The number of default options cannot exceed maximum picks.';
  return '';
}

export function comboOptionError(option: ComboOption, group: ComboGroup): string {
  if (!option.itemId) return 'Choose a saved regular menu item.';
  if (!option.name.trim() || option.name.trim().length > 150) return 'Enter an option name of 1–150 characters.';
  if (group.options.some(row => row.id !== option.id && row.itemId === option.itemId)) return 'This item is already an option in this group.';
  if (!Number.isFinite(option.quantity) || option.quantity < .001 || option.quantity > 9999999.999 || Math.abs(option.quantity * 1000 - Math.round(option.quantity * 1000)) > .00001) return 'Quantity must be positive, with at most 3 decimal places (maximum 9,999,999.999).';
  if (option.extraPrice !== null && (!Number.isFinite(option.extraPrice) || option.extraPrice < 0 || option.extraPrice > 999999999 || Math.abs(option.extraPrice * 100 - Math.round(option.extraPrice * 100)) > .00001)) return 'Extra price must be blank or non-negative, with at most 2 decimal places.';
  if (!Number.isInteger(option.order) || option.order < 1) return 'Display order must be a positive whole number.';
  const defaults = [...group.options.filter(row => row.id !== option.id), option].filter(row => row.available && row.isDefault);
  if (group.selectionType === 'selectable' && defaults.length > group.max) return `This group allows at most ${group.max} default options.`;
  return '';
}

export function normalizeComboGroup(group: ComboGroup): ComboGroup {
  if (group.selectionType !== 'fixed') return group;
  const count = group.options.filter(option => option.available).length;
  return { ...group, min: count, max: count, required: count > 0, options: group.options.map(option => ({ ...option, isDefault: option.available })) };
}
