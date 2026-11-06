'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { menuScreenHref, menuSectionForView, menuSections } from '../../lib/admin-menu';
import { OriginalMenuProvider, useLegacyMenu } from './legacy-menu-client';
import { MenuNavigation } from './MenuControls';
import ItemsWorkspace from './ItemsWorkspace';
import CategoriesWorkspace from './CategoriesWorkspace';
import VariantsWorkspace from './VariantsWorkspace';
import ModifierGroupsWorkspace from './ModifierGroupsWorkspace';
import ComboItemsWorkspace from './ComboItemsWorkspace';
import OffersWorkspace from './OffersWorkspace';
import TaxRulesWorkspace from './TaxRulesWorkspace';
import InventoryWorkspace from './InventoryWorkspace';
import SchedulesWorkspace from './SchedulesWorkspace';
import PricingWorkspace from './PricingWorkspace';
import SeoMetaWorkspace from './SeoMetaWorkspace';
export default function MenuWorkspace() {
 const params = useSearchParams();
 return <OriginalMenuProvider key={params.get('store_code') || 'default'}><MenuScreens /></OriginalMenuProvider>;
}
function MenuScreens() {
 const router = useRouter(); const params = useSearchParams();
 const menu = useLegacyMenu();
 const section = menuSectionForView(params.get('view'));
 function navigate(label: string) { const code = menu.storeCode; router.push(menuScreenHref(label) + (code ? '&store_code=' + encodeURIComponent(code) : ''), { scroll: false }); }
 if (menu.loading) return <div className="mw-workspace" role="status">Loading menu workspace…</div>;
 const current = menuSections.find(entry => entry.label === section)!;
 if (!menu.canCreate(current.view)) return <div className="mw-workspace"><MenuNavigation active="" onChange={navigate} /><p role={menu.error ? 'alert' : 'status'}>{menu.error || 'This menu section is hidden by Super Admin. Select an available section above.'}</p></div>;
 return <>
 {menu.canCreate('items') && <ItemsWorkspace hidden={section !== 'Items'} onNavigate={navigate} />}
 {menu.canCreate('categories') && <CategoriesWorkspace hidden={section !== 'Categories'} onNavigate={navigate} />}
 {menu.canCreate('variants') && <VariantsWorkspace hidden={section !== 'Variants'} onNavigate={navigate} />}
 {menu.canCreate('modifier-groups') && <ModifierGroupsWorkspace hidden={section !== 'Modifier Groups'} onNavigate={navigate} />}
 {menu.canCreate('combo-items') && <ComboItemsWorkspace hidden={section !== 'Combo Master'} onNavigate={navigate} />}
 {menu.canCreate('offers') && <OffersWorkspace hidden={section !== 'Offers'} onNavigate={navigate} />}
 {menu.canCreate('tax-rules') && <TaxRulesWorkspace hidden={section !== 'Tax Rules'} onNavigate={navigate} />}
 {menu.canCreate('inventory') && <InventoryWorkspace hidden={section !== 'Inventory'} onNavigate={navigate} />}
 {menu.canCreate('schedules') && <SchedulesWorkspace hidden={section !== 'Schedules'} onNavigate={navigate} />}
 {menu.canCreate('pricing') && <PricingWorkspace hidden={section !== 'Pricing'} onNavigate={navigate} />}
 {menu.canCreate('seo-meta') && <SeoMetaWorkspace hidden={section !== 'SEO & Meta'} onNavigate={navigate} />}
 </>;
}
