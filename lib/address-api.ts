import { env as workerEnv } from 'cloudflare:workers';
import { envText, sameOrigin } from './auth';
import { authenticatedCustomer } from './customer-session';
import { createPrismaClient } from './prisma';
import { limitedJson, BrandingError } from './branding-validation';
import { AddressError, listAddresses, mutateAddress } from './user-addresses';

export function addressStoreCode() {
  const code = envText((workerEnv as unknown as Record<string, unknown>).STORE_CODE) || envText(process.env.STORE_CODE);
  if (!code || code.length > 50) throw new AddressError('Saved addresses require a server STORE_CODE setting.', 503);
  return code;
}
export async function addressRequest(request: Request, action: 'list' | 'create' | 'edit' | 'delete' | 'default', id?: string) {
  let db: ReturnType<typeof createPrismaClient> | undefined;
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (action !== 'list' && !sameOrigin(request)) throw new AddressError('Invalid origin.', 403);
    const storeCode = addressStoreCode();
    const user = await authenticatedCustomer(request, storeCode);
    if (!user) throw new AddressError('Please sign in to manage saved addresses.', 401);
    // Headers, query parameters and body tenant/user fields never determine scope.
    const scope = { userId: user.id, storeCode };
    const body = action === 'create' || action === 'edit' ? await limitedJson(request, 16384) : undefined;
    db = createPrismaClient();
    const addresses = action === 'list' ? await listAddresses(db, scope) : await mutateAddress(db, scope, action, id, body);
    return json({ addresses }, action === 'create' ? 201 : 200);
  } catch (error) {
    if (error instanceof AddressError || error instanceof BrandingError) return json({ error: error.message }, error.status);
    // Input validation errors are safe to show, database errors are not.
    if (error instanceof Error && /^(Enter |Select |Only US|Invalid default)/.test(error.message)) return json({ error: error.message }, 400);
    console.error('Saved address request failed', error);
    return json({ error: 'Unable to access saved addresses. Please try again.' }, 503);
  } finally { await db?.$disconnect(); }
}
