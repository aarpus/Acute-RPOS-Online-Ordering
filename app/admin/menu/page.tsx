'use client';

import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import MenuWorkspace from '../../../components/admin/MenuWorkspace';
import './menu.css';
import './items.css';
import './variants.css';
import './modifiers.css';
import './offers.css';
import './tax-rules.css';
import './inventory.css';
import './schedules.css';
import './pricing.css';
import './seo-meta.css';

export default function MenuPage() {
  const router = useRouter();

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  return (
    <div className="menu-design"><AdminShell active="Menu" pageTitle="" pageSubtitle="" onSignOut={signOut}>
      <Suspense fallback={<div className="mw-workspace" role="status">Loading menu workspace…</div>}><MenuWorkspace /></Suspense>
    </AdminShell></div>
  );
}
