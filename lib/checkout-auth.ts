import type { SessionUser } from './auth';

const checkoutPaths = ['/pickup', '/checkout', '/checkout/payment'];
export const isCheckoutPath = (path: string) => checkoutPaths.includes(path);
export function checkoutReturnPath(next: string | null) { return next && isCheckoutPath(next) ? next : '/account'; }
export function storePath(path: string, storeCode: string) { return `${path}?${new URLSearchParams({ store_code:storeCode })}`; }
export function authPagePath(page: '/login' | '/register', next: string, storeCode: string) {
  const params = new URLSearchParams({store_code:storeCode});
  if (isCheckoutPath(next)) params.set('next',next);
  return `${page}?${params}`;
}
export async function checkoutSession(storeFetch: (url: string, init?: RequestInit) => Promise<Response>): Promise<SessionUser | null> {
  const response = await storeFetch('/api/auth/session');
  const result = await response.json() as { user?: SessionUser | null; error?: string };
  if (!response.ok) throw new Error(result.error || 'Unable to check your login. Please try again.');
  return result.user?.id ? result.user : null;
}
