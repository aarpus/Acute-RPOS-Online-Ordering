import { env } from 'cloudflare:workers';
export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const key = (await context.params).key.join('/');
  if (!/^[a-f\d]{64}\/[a-f\d-]+\.(png|jpg|webp)$/.test(key) || !env.BRANDING_IMAGES) return new Response('Not found', { status: 404 });
  const object = await env.BRANDING_IMAGES.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
