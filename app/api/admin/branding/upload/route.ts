import { env } from 'cloudflare:workers';
import { randomUUID } from 'node:crypto';
import { adminContext, brandingResponse, ok } from '../../../../../lib/branding';
import { BrandingError } from '../../../../../lib/branding-validation';
import { MAX_IMAGE_SIZE, validateImage } from '../../../../../lib/branding-images';
export async function POST(request: Request) {
  try {
    const { storeCode } = await adminContext(request);
    if (!env.BRANDING_IMAGES) throw new BrandingError('R2 image storage is not configured.', 503);
    const reader = request.body?.getReader();
    if (!reader) throw new BrandingError('Image required.');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_IMAGE_SIZE) { await reader.cancel(); throw new BrandingError('Images must be at most 2MB.', 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const { mime, extension } = validateImage(bytes, request.headers.get('content-type') || '');
    // UUID namespaces avoid unsafe user-supplied path characters.
    const namespace = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(storeCode));
    const prefix = Array.from(new Uint8Array(namespace)).map(b => b.toString(16).padStart(2, '0')).join('');
    const key = `${prefix}/${randomUUID()}.${extension}`;
    await env.BRANDING_IMAGES.put(key, bytes, { httpMetadata: { contentType: mime } });
    return ok({ url: `/api/media/${key}` }, 201);
  } catch (error) { return brandingResponse(error); }
}
