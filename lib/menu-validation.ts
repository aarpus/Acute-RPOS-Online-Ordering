import { menuResources, menuConfigurationFields, type FieldSpec } from './menu-contract';

export class MenuError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MenuError('Expected an object.');
  return value as Record<string, unknown>;
}
export function safeUrl(value: string, relative = true) {
  if (relative && /^\/(?!\/)[^\s\\]*$/.test(value)) return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function fieldValue(field: FieldSpec, input: unknown): unknown {
  if (input === undefined && field.default !== undefined) input = field.default;
  const empty = input === undefined || input === null || input === '';
  if (empty) {
    if (field.required) throw new MenuError(`${field.label} is required.`);
    return field.default !== undefined && input === undefined ? field.default : null;
  }
  if (field.kind === 'boolean') {
    if (typeof input !== 'boolean') throw new MenuError(`${field.label} must be true or false.`);
    return input;
  }
  if (field.kind === 'number') {
    if (!['number', 'string'].includes(typeof input) || !/^-?\d+(\.\d+)?$/.test(String(input))) throw new MenuError(`${field.label} must be a number.`);
    const value = Number(input);
    const precision = field.precision ?? 2;
    if (!Number.isFinite(value) || Math.abs(value) > 999999999 || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max) || (field.integer && !Number.isInteger(value)) || Math.abs(value * 10 ** precision - Math.round(value * 10 ** precision)) > 0.00001) throw new MenuError(`${field.label} is outside its allowed range or precision.`);
    return value;
  }
  if (field.kind === 'json') {
    if (typeof input !== 'object') throw new MenuError(`${field.label} must contain JSON.`);
    if (field.key === 'configuration' && Array.isArray(input)) throw new MenuError('Additional settings must be a JSON object.');
    if (JSON.stringify(input).length > 30000) throw new MenuError(`${field.label} is too large.`);
    return input;
  }
  if (field.kind === 'references') {
    if (!Array.isArray(input) || input.length > 200 || input.some(id => typeof id !== 'string' || !uuidPattern.test(id)) || new Set(input).size !== input.length) throw new MenuError(`${field.label} contains invalid or duplicate IDs.`);
    return input;
  }
  if (typeof input !== 'string') throw new MenuError(`${field.label} must be text.`);
  const value = input.trim();
  if (value.length > (field.length ?? 10000) || (field.required && !value)) throw new MenuError(`${field.label} is invalid or too long.`);
  if (field.kind === 'reference' && !uuidPattern.test(value)) throw new MenuError(`${field.label} must be a valid record ID.`);
  if (field.kind === 'select' && !field.choices?.includes(value)) throw new MenuError(`${field.label} has an invalid value.`);
  if ((field.kind === 'image' || field.key === 'canonicalUrl') && !safeUrl(value, field.key !== 'canonicalUrl')) throw new MenuError(`${field.label} must use a safe HTTP URL${field.kind === 'image' ? ' or local path' : ''}.`);
  if (field.kind === 'time') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new MenuError('Invalid time.');
    return new Date(`1970-01-01T${value}:00Z`);
  }
  if (field.kind === 'date' || field.kind === 'datetime') {
    if (field.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new MenuError('Invalid date.');
    const date = new Date(field.kind === 'date' ? `${value}T00:00:00Z` : value);
    if (!Number.isFinite(date.getTime()) || (field.kind === 'date' && date.toISOString().slice(0, 10) !== value)) throw new MenuError('Invalid date.');
    return date;
  }
  return value || null;
}

export function validateMenuInput(resource: string, input: Record<string, unknown>, current?: Record<string, unknown>) {
  const spec = menuResources[resource];
  if (!spec) throw new MenuError('Unknown menu resource.', 404);
  const out: Record<string, unknown> = {};
  for (const field of spec.fields) {
    const value = input[field.key] === undefined ? current?.[field.key] : input[field.key];
    // Prisma dates are normalized before passing existing rows through validation.
    const dateValue = typeof value === 'string' && ['time', 'date'].includes(field.kind) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) ? new Date(value) : value;
    const normalized = dateValue instanceof Date ? field.kind === 'time' ? dateValue.toISOString().slice(11, 16) : field.kind === 'date' ? dateValue.toISOString().slice(0, 10) : dateValue.toISOString() : field.kind === 'number' && dateValue != null ? String(dateValue) : dateValue;
    out[field.key] = fieldValue(field, normalized);
  }
  if (resource === 'combo-items') out.itemType = 'combo';
  const configuration = out.configuration as Record<string, unknown> | null;
  if (configuration) for (const field of menuConfigurationFields[resource] ?? []) {
    // Supplemental settings are optional; retain unknown keys for compatibility.
    if (configuration[field.key] !== undefined) {
      const normalized = fieldValue(field, configuration[field.key]);
      configuration[field.key] = normalized instanceof Date ? field.kind === 'time' ? normalized.toISOString().slice(11, 16) : normalized.toISOString().slice(0, 10) : normalized;
    }
  }
  if ((resource === 'items' || resource === 'combo-items') && (!Array.isArray(out.categoryIds) || out.categoryIds.length === 0)) throw new MenuError('Select at least one category.');
  if (out.maximumQuantity !== null && Number(out.maximumQuantity) < Number(out.minimumQuantity)) throw new MenuError('Maximum quantity must be at least the minimum.');
  if (out.maxSelect !== undefined && Number(out.maxSelect) < Number(out.minSelect)) throw new MenuError('Maximum selections must be at least the minimum.');
  if (out.selectionType === 'single' && out.maxSelect !== 1) throw new MenuError('A single selection group requires maximum selections of 1.');
  if (out.isRequired && Number(out.minSelect) < 1) throw new MenuError('Required combo groups need a positive minimum.');
  if (out.maxQuantity !== undefined && Number(out.maxQuantity) < Number(out.minQuantity)) throw new MenuError('Invalid option quantity bounds.');
  if (out.minSelectOverride != null && out.maxSelectOverride != null && Number(out.minSelectOverride) > Number(out.maxSelectOverride)) throw new MenuError('Invalid selection overrides.');
  if (out.startAt && out.endAt && Number(out.startAt) >= Number(out.endAt)) throw new MenuError('End must be after start.');
  if (out.startDate && out.endDate && Number(out.startDate) > Number(out.endDate)) throw new MenuError('End date must not precede start date.');
  if (resource === 'inventory') {
    if (out.trackInventory && out.quantityAvailable === null) throw new MenuError('Tracked inventory requires a quantity.');
    if (!out.allowBackorder && out.quantityAvailable !== null && Number(out.quantityAvailable) < 0) throw new MenuError('Negative stock requires backorders.');
  }
  if (resource === 'schedules') {
    try { new Intl.DateTimeFormat('en', { timeZone: String(out.timezone) }); } catch { throw new MenuError('Invalid IANA timezone.'); }
    if (!!out.startTime !== !!out.endTime) throw new MenuError('Provide both start and end time.');
    if (out.daysOfWeek !== null && (!Array.isArray(out.daysOfWeek) || out.daysOfWeek.some(day => !Number.isInteger(day) || day < 1 || day > 7))) throw new MenuError('Days must be numbers from 1 to 7.');
  }
  if (resource === 'offers') {
    if (out.offerType === 'percentage' && (out.discountValue === null || Number(out.discountValue) > 100)) throw new MenuError('Percentage discounts must be between 0 and 100.');
    if (out.couponRequired && !out.offerCode) throw new MenuError('A coupon code is required.');
  }
  if (resource === 'pricing') {
    if (!/^[A-Z]{3}$/.test(String(out.currency))) throw new MenuError('Use a three-letter uppercase currency.');
    if (out.priceType === 'variant' && !out.variantId) throw new MenuError('Variant pricing requires a variant.');
    if (out.priceType === 'scheduled' && !out.startAt && !out.endAt) throw new MenuError('Scheduled pricing requires a time window.');
  }
  if (resource === 'seo-meta' && !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(String(out.slug))) throw new MenuError('Use a local URL path such as /menu/chicken-biryani.');
  return out;
}

export function windowsOverlap(a: { startAt?: unknown; endAt?: unknown }, b: { startAt?: unknown; endAt?: unknown }) {
  const time = (v: unknown, fallback: number) => v == null ? fallback : v instanceof Date ? v.getTime() : new Date(String(v)).getTime();
  return time(a.startAt, -Infinity) < time(b.endAt, Infinity) && time(b.startAt, -Infinity) < time(a.endAt, Infinity);
}
