import { homeData } from '../data/home';
import { Prisma } from '@prisma/client';
import { createPrismaClient } from './prisma';
import { publicMenu } from './menu-public';

type PublicStoreRow = {
  storeid: string;
  storename: string | null;
  store_code: string | null;
  storetime: string | null;
  storeaddress1: string | null;
  storeaddress2: string | null;
  storecity: string | null;
  storestate: string | null;
  storezipcode: string | null;
  storephonenumber: string | null;
};

export async function getStorefront(request: Request, options: { mode?: string; at?: Date } = {}) {
  const prisma = createPrismaClient();
  try {
    // Only public contact details are exposed; banking and audit data stay private.
    const rows = await prisma.$queryRaw<PublicStoreRow[]>(Prisma.sql`
      SELECT storeid::text AS storeid, storename, store_code, storetime, storeaddress1,
        storeaddress2, storecity, storestate, storezipcode, storephonenumber
      FROM public.tbl_store
      WHERE is_active = true AND COALESCE(is_delete, false) = false
      ORDER BY storeid ASC
    `);
    const stores = rows.filter((row) => row.store_code?.trim() && row.storename?.trim()).map((row) => ({
      id: row.storeid.toString(), code: row.store_code!, name: row.storename!,
      address: [row.storeaddress1, row.storeaddress2, row.storecity, row.storestate, row.storezipcode].filter(Boolean).join(', '),
      phone: row.storephonenumber || '',
      hours: row.storetime || '',
    }));
    const code = request.headers.get('x-store-code');
    // Only active, nondeleted stores returned by PostgreSQL may be selected.
    const selected = code === null ? stores[0] : stores.find(store => store.code === code);
    if (!selected) throw new Error('The selected store is unavailable. Select an active store.');
    if (stores.filter((store) => store.code === selected.code).length !== 1) {
      throw new Error('Store codes must be unique. Update duplicate codes in the admin panel.');
    }
    const [branding, hero, catalog, seo] = await Promise.all([
      prisma.websiteBranding.findUnique({ where: { storeCode: selected.code } }),
      prisma.heroBanner.findFirst({ where: { storeCode: selected.code, status: 1 } }),
      prisma.$transaction(tx => publicMenu(tx, selected.code, homeData.store.currency, options.mode || request.headers.get('x-order-mode') || 'Delivery', options.at), { isolationLevel: 'RepeatableRead', timeout: 20000 }),
      prisma.menuSeo.findMany({ where: { storeCode: selected.code, archivedAt: null, isActive: true }, select: { targetType: true, targetId: true, slug: true, title: true, description: true, keywords: true, canonicalUrl: true, imageUrl: true } }),
    ]);
    return {
      ...homeData,
      branding: branding ? { primaryColor: branding.primaryColor, headerColor: branding.headerColor, footerColor: branding.footerColor, footerTextColor: branding.footerTextColor, accentColor: branding.accentColor, navAlignment: branding.navAlignment } : null,
      hero: hero ? { image: hero.imageUrl, imageAlt: hero.heading || '', eyebrow: hero.eyebrow || '', subtitle: hero.subtitle || '', title: hero.heading || '', textColor: hero.textColor, alignment: hero.alignment as 'left' | 'center' | 'right', overlayOpacity: hero.overlayOpacity } : { ...homeData.hero, subtitle: '', textColor: '#FFFFFF', alignment: 'left' as const, overlayOpacity: 40 },
      ...catalog,
      seo,
      ordering: { ...homeData.ordering, promo: { code: '', percent: 0 } },
      stores,
      store: { ...homeData.store, ...selected, logo: branding?.logoUrl || homeData.store.logo, logoWidth: branding?.logoWidth ?? 56 },
      header: { ...homeData.header, locations: stores.map((store) => store.name) },
      footer: { ...homeData.footer, copyright: `© ${new Date().getFullYear()} ${selected.name}. All rights reserved.` },
    };
  } finally { await prisma.$disconnect(); }
}
