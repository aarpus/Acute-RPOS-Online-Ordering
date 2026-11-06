type Seo = { title: string; description: string | null; keywords: string | null; canonicalUrl: string | null; imageUrl: string | null };
// Return a cleanup so closing a product preview restores page/category metadata.
export function applyDocumentSeo(seo: Seo) {
  const oldTitle = document.title; document.title = seo.title;
  const restore: (() => void)[] = [];
  for (const [name, content] of [['description', seo.description], ['keywords', seo.keywords], ['og:title', seo.title], ['og:description', seo.description], ['og:image', seo.imageUrl]]) {
    if (!content || !name) continue;
    const attribute = name.startsWith('og:') ? 'property' : 'name';
    const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
    const meta = existing ?? document.createElement('meta'); const old = meta.content;
    meta.setAttribute(attribute, name); meta.content = content;
    if (!existing) document.head.appendChild(meta);
    restore.push(() => { if (existing) meta.content = old; else meta.remove(); });
  }
  if (seo.canonicalUrl) {
    const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const link = existing ?? document.createElement('link'); const old = link.href;
    link.rel = 'canonical'; link.href = seo.canonicalUrl;
    if (!existing) document.head.appendChild(link);
    restore.push(() => { if (existing) link.href = old; else link.remove(); });
  }
  return () => { document.title = oldTitle; restore.forEach(action => action()); };
}
