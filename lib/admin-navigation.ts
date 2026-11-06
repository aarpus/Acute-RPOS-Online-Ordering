// One navigation list supplies labels, icons, and destinations to every admin page.
export const adminNavigation = [
  { icon: 'dashboard', label: 'Dashboard', href: '/admin/dashboard' },
  { icon: 'stores', label: 'Stores', href: '/admin/stores' },
  { icon: 'menu', label: 'Menu', href: '/admin/menu' },
  { icon: 'user', label: 'Customers', href: '/admin/customers' },
  { icon: 'branding', label: 'Branding', href: '/admin/branding' },
  { icon: 'orders', label: 'Orders & Payments', href: '/admin/orders' },
  { icon: 'sync', label: 'Sync Logs', href: '/admin/sync-logs' },
  { icon: 'team', label: 'Team', href: '/admin/team' },
  { icon: 'settings', label: 'Settings', href: '/admin/settings' },
] as const;

export function adminNavigationForPath(pathname: string) {
  if (pathname === '/admin' || pathname === '/admin/') return adminNavigation[0];
  return adminNavigation.find(item => pathname === item.href || pathname.startsWith(item.href + '/'));
}
