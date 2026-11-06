import type { WebsiteBranding, HeroBanner, WebsiteCategory } from '@prisma/client';
export type BrandingSnapshot = { branding: WebsiteBranding | null; hero: HeroBanner | null; categories: WebsiteCategory[] };
const pending = new Map<string, File>();
export function stageImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP image at most 2MB.');
  const url = URL.createObjectURL(file); pending.set(url, file); return url;
}
export function clearPendingImages() { for (const url of pending.keys()) URL.revokeObjectURL(url); pending.clear(); }
export async function brandingRequest<T = BrandingSnapshot>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const result = await response.json() as { error?: string; data: T };
  if (!response.ok) throw new Error(result.error || 'Unable to save changes.');
  return result.data;
}
export async function persistImage(url: string, storeCode: string) {
  if (!url.startsWith('blob:')) return url;
  const file = pending.get(url);
  if (!file) throw new Error('Please select the image again.');
  const result = await brandingRequest<{url: string}>(`/api/admin/branding/upload?store_code=${encodeURIComponent(storeCode)}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
  return result.url as string;
}
