import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '../../../../lib/admin-auth';
import { createStore, getTrustedStoreContext, listStores, normalizeStoreInput, storeCodeExists, validateStoreInput } from '../../../../lib/admin-stores';

function configurationError(error: unknown) {
  return error instanceof Error && error.message === 'COMPANY_CODE_NOT_CONFIGURED';
}

export async function GET(request: Request) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyCode } = getTrustedStoreContext(admin);
    return NextResponse.json({ companyCode, stores: await listStores(companyCode) });
  } catch (error) {
    if (configurationError(error)) return NextResponse.json({ error: 'Store company code is not configured on the server.' }, { status: 503 });
    console.error('Store list failed:', error);
    return NextResponse.json({ error: 'Unable to load stores.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyCode, userId } = getTrustedStoreContext(admin);
    const input = normalizeStoreInput(await request.json());
    const errors = validateStoreInput(input);
    if (Object.keys(errors).length) return NextResponse.json({ error: 'Validation failed.', fields: errors }, { status: 400 });
    if (await storeCodeExists(input.store_code)) {
      const message = 'Store Code already exists. Please use a different code.';
      return NextResponse.json({ error: message, fields: { store_code: message } }, { status: 409 });
    }
    return NextResponse.json({ store: await createStore(input, companyCode, userId) }, { status: 201 });
  } catch (error) {
    if (configurationError(error)) return NextResponse.json({ error: 'Store audit identity is not configured on the server.' }, { status: 503 });
    console.error('Store creation failed:', error);
    return NextResponse.json({ error: 'Unable to save the store.' }, { status: 500 });
  }
}
