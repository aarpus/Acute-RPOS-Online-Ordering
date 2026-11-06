import { homeData } from '../data/home';
import { resolveMenuCategory } from './menu';
import type { getStorefront } from './storefront';
import type { BrandSettings, Category } from '../components/admin/BrandingWorkspace';

export type WebsitePreviewDraft = {
  type: 'website-preview:update';
  storeCode: string;
  settings: BrandSettings;
  categories: Category[];
};

// Preview drafts only change presentation in the embedded page, never saved data.
export function applyWebsitePreview(data: Awaited<ReturnType<typeof getStorefront>>, draft: WebsitePreviewDraft | null) {
  if (!draft || draft.storeCode !== data.store.code) return data;
  const s = draft.settings;
  return {
    ...data,
    store: { ...data.store, logo: s.logo, logoWidth: s.logoWidth },
    branding: { primaryColor: s.primaryColor, headerColor: s.headerColor, footerColor: s.footerColor, footerTextColor: s.footerTextColor, accentColor: s.accentColor, navAlignment: s.navAlignment },
    hero: { image: s.hero, imageAlt: s.heading, eyebrow: s.eyebrow, subtitle: s.subtitle, title: s.heading, textColor: s.textColor, alignment: s.alignment, overlayOpacity: s.overlay },

  };
}
