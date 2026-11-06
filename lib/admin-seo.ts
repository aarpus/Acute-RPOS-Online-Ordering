export function seoPreviewUrl(canonical: string, slug = '/') {
  try {
    const url = new URL(canonical.trim() || slug, 'https://acutepos.com/');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { url: url.href, domain: url.hostname.toUpperCase() };
  } catch { return null; }
}
