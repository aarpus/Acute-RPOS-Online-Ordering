export class BrandingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BrandingError('Expected a JSON object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max: number, required = false): string {
  if (value === undefined || value === null) { if (required) throw new BrandingError('A required field is missing.'); return ''; }
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new BrandingError(`Invalid text field (maximum ${max} characters).`);
  return value.trim();
}
export function color(value: unknown): string {
  if (typeof value !== 'string' || !/^#[a-f\d]{6}$/i.test(value)) throw new BrandingError('Colors must be six-digit HEX values.');
  return value.toUpperCase();
}
export function imageUrl(value: unknown, required = false): string {
  const url = text(value, 2048, required);
  if (!url) return '';
  // Images are displayed by the browser, never downloaded by this server.
  // Local uploads and local HTTP hosts/ports are valid image locations too.
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\') && !/[\u0000-\u001f\u007f]/.test(url)) return url;
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new BrandingError('Enter an image URL or a path such as /images/banner.jpg.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new BrandingError('Use an HTTP/HTTPS image URL or a local image path.');
  return parsed.href;
}
function integer(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new BrandingError('Invalid integer value.');
  return value;
}
export function brandingInput(value: unknown) {
  const b = object(value);
  if (b.navAlignment !== undefined && (typeof b.navAlignment !== 'string' || !['left', 'center', 'right'].includes(b.navAlignment))) throw new BrandingError('Navbar menu position must be left, center or right.');
  return { logoUrl: imageUrl(b.logoUrl), ...(b.logoWidth === undefined ? {} : { logoWidth: integer(b.logoWidth, 24, 400) }), ...(b.navAlignment === undefined ? {} : { navAlignment: b.navAlignment as string }), primaryColor: color(b.primaryColor), headerColor: color(b.headerColor), footerColor: color(b.footerColor), ...(b.footerTextColor === undefined ? {} : { footerTextColor: color(b.footerTextColor) }), accentColor: color(b.accentColor) };
}
export function heroInput(value: unknown, pos = false) {
  const b = object(value);
  const alignment = b.alignment ?? 'left';
  if (typeof alignment !== 'string' || !['left', 'center', 'right'].includes(alignment)) throw new BrandingError('Invalid hero alignment.');
  return { imageUrl: imageUrl(pos ? b.image_url : b.imageUrl, true), ...(pos || b.externalBannerId !== undefined ? { externalBannerId: text(pos ? b.external_banner_id : b.externalBannerId, 100) || null } : {}), eyebrow: text(b.eyebrow, 255), subtitle: text(b.subtitle, 10000), heading: text(b.heading, 10000), textColor: color((pos ? b.text_color : b.textColor) ?? '#FFFFFF'), alignment: alignment as string, overlayOpacity: integer((pos ? b.overlay_opacity : b.overlayOpacity) ?? 40, 0, 80) };
}
export function categoryInput(value: unknown, pos = false) {
  const b = object(value);
  const visible = (pos ? b.is_visible : b.isVisible) ?? true;
  if (typeof visible !== 'boolean') throw new BrandingError('Visibility must be boolean.');
  return { categoryName: text(pos ? b.category_name : b.categoryName, 150, true), imageUrl: imageUrl(pos ? b.image_url : b.imageUrl) || null, description: text(b.description, 10000), ...(pos || b.externalCategoryId !== undefined ? { externalCategoryId: text(pos ? b.external_category_id : b.externalCategoryId, 100) || null } : {}), displayOrder: integer((pos ? b.display_order : b.displayOrder) ?? 0, 0, 2147483647), isVisible: visible };
}
export function posMenuCategoryInput(value: unknown) {
  const b = object(value);
  const category = categoryInput(b, true);
  const externalCategoryId = text(b.external_category_id, 100, true);
  if (b.is_active !== undefined && typeof b.is_active !== 'boolean') throw new BrandingError('is_active must be boolean.');
  return { ...category, externalCategoryId, ...(b.is_active === undefined ? {} : { isActive: b.is_active as boolean }) };
}
export async function limitedJson(request: Request, limit = 256 * 1024) {
  if (Number(request.headers.get('content-length')) > limit) throw new BrandingError('Payload too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new BrandingError('Request body required.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new BrandingError('Payload too large.', 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return object(JSON.parse(new TextDecoder().decode(bytes))); } catch (error) { if (error instanceof BrandingError) throw error; throw new BrandingError('Invalid JSON.'); }
}
