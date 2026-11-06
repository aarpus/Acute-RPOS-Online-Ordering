export type OfferIssue = { field: string; tab: string; message: string };
type OfferForm = {
  id: number; name: string; type: string; value: number; minimum: number; maxDiscount: number;
  usage: number; perCustomer: number; minItems: number; buyQty: number; getQty: number; priority: number;
  start: string; end: string; days: string[]; startTime: string; endTime: string;
  scope: string; items: string[]; categories: string[]; code: string; externalId: string;
};
export function validateOfferForm(draft: OfferForm, offers: Pick<OfferForm, 'id' | 'name' | 'code' | 'externalId'>[]): OfferIssue[] {
  const issues: OfferIssue[] = [];
  const add = (field: string, tab: string, message: string) => issues.push({ field, tab, message });
  const duplicate = (key: 'name' | 'code' | 'externalId') => draft[key].trim() && offers.some(offer => offer.id !== draft.id && offer[key].trim().toLowerCase() === draft[key].trim().toLowerCase());
  if (!draft.name.trim()) add('Offer Name', 'Basic Info', 'Enter an offer name.');
  else if (duplicate('name')) add('Offer Name', 'Basic Info', 'An offer with this name already exists. Use a different name.');
  for (const [key, field, tab] of [['value', draft.type === 'Percentage Discount' ? 'Discount Value (%)' : 'Discount Value ($)', 'Basic Info'], ['minimum', 'Minimum Order Amount', 'Basic Info'], ['maxDiscount', 'Max Discount Amount', 'Basic Info']] as const) {
    if (key === 'value' && ['Free Delivery', 'Buy 1 Get 1 Free'].includes(draft.type)) continue;
    const value = draft[key];
    if (!Number.isFinite(value) || value < 0 || value > 999999999 || Math.abs(value * 100 - Math.round(value * 100)) > .00001) add(field, tab, 'Enter a non-negative amount with at most 2 decimal places.');
    else if (key === 'value' && draft.type === 'Percentage Discount' && value > 100) add(field, tab, 'Percentage discount cannot exceed 100%.');
  }
  for (const [key, field, tab, min] of [['usage', 'Usage Limit', 'Basic Info', 0], ['perCustomer', 'Usage Limit per Customer', 'Conditions', 0], ['minItems', 'Minimum Item Quantity', 'Conditions', 1], ['buyQty', 'Buy Quantity', 'Basic Info', 1], ['getQty', 'Get Free Quantity', 'Conditions', 1], ['priority', 'Priority', 'Advanced', 0]] as const) {
    if (['buyQty', 'getQty'].includes(key) && draft.type !== 'Buy 1 Get 1 Free') continue;
    if (!Number.isInteger(draft[key]) || draft[key] < min || draft[key] > 999999999) add(field, tab, `Enter a whole number of ${min} or more${min === 0 && key !== 'priority' ? ' (0 means unlimited)' : ''}.`);
  }
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(draft.start)) add('Start Date', 'Basic Info', 'Choose a valid start date.');
  if (!validDate(draft.end)) add('End Date', 'Basic Info', 'Choose a valid end date.');
  else if (validDate(draft.start) && draft.end < draft.start) add('End Date', 'Basic Info', 'End date must be on or after the start date.');
  if (!draft.days.length) add('Available Days', 'Schedule', 'Select at least one available day.');
  for (const [key, field] of [['startTime', 'Start Time'], ['endTime', 'End Time']] as const) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft[key])) add(field, 'Schedule', 'Enter a valid time.');
  if (draft.scope === 'Selected Items' && !draft.items.length) add('Apply Offer To', 'Apply To Items', 'Select at least one item, or choose All Items.');
  if (draft.scope === 'Selected Categories' && !draft.categories.length) add('Apply Offer To', 'Apply To Items', 'Select at least one category, or choose All Items.');
  if (duplicate('code')) add('Promo Code', 'Advanced', 'This promo code is already used by another offer.');
  if (duplicate('externalId')) add('External Offer ID (POS)', 'Advanced', 'This external offer ID is already used by another offer.');
  return issues;
}
