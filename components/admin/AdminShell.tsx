'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AdminFooter from './AdminFooter';
import AdminHeader from './AdminHeader';
import AdminSidebar from './AdminSidebar';
import { adminNavigation, adminNavigationForPath } from '../../lib/admin-navigation';

export default function AdminShell({ children, onSignOut, active = 'Dashboard', pageTitle = 'Company Dashboard', pageSubtitle = 'Overview of your restaurant websites, integrations and orders' }: { children: React.ReactNode; onSignOut: () => void; active?: string; pageTitle?: string; pageSubtitle?: string }) {
  const router = useRouter(); const pathname = usePathname(); const [selected, setSelected] = useState(active); const [menuOpen, setMenuOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => { setSelected(adminNavigationForPath(pathname)?.label ?? active); }, [active, pathname]);
  useEffect(() => { let cancelled = false; fetch('/api/admin/session').then((response) => { if (!response.ok && !cancelled) router.replace('/admin/login'); }).catch(() => { if (!cancelled) router.replace('/admin/login'); }); return () => { cancelled = true; }; }, [router, pathname]);
  return <div className="admin-shell min-h-screen bg-[#f5f7fa] text-[#152033]"><AdminHeader menuOpen={menuOpen} setMenuOpen={setMenuOpen} profileOpen={profileOpen} setProfileOpen={setProfileOpen} onSignOut={onSignOut} /><AdminSidebar active={selected} open={menuOpen} onSelect={(label) => { const item = adminNavigation.find(entry => entry.label === label); if (item) { setSelected(label); setMenuOpen(false); router.push(item.href); } }} />{menuOpen && <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-10 bg-slate-950/40 lg:hidden" />}<div className="admin-shell-content flex min-h-screen flex-col pt-[58px]"><main className="flex-1"><div className="px-5 pt-4 sm:px-8"><p className="text-xs font-semibold text-[#6b84a4]">{pageSubtitle}</p><h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-[#183f70]">{pageTitle}</h1></div>{children}</main><AdminFooter /></div></div>;
}
