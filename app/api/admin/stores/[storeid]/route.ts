import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '../../../../../lib/admin-auth';
import { findStore, getTrustedStoreContext, normalizeStoreInput, updateStore, validateStoreInput } from '../../../../../lib/admin-stores';

type Context = { params: Promise<{ storeid: string }> };
function validId(value: string) { return /^\d+$/.test(value) && value !== '0'; }

export async function GET(request: Request, context: Context) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { storeid } = await context.params;
    if (!validId(storeid)) return NextResponse.json({ error: 'Invalid store ID.' }, { status: 400 });
    const { companyCode } = getTrustedStoreContext(admin);
    const store = await findStore(storeid, companyCode);
    return store ? NextResponse.json({ store }) : NextResponse.json({ error: 'Store not found.' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'COMPANY_CODE_NOT_CONFIGURED') return NextResponse.json({ error: 'Store company code is not configured on the server.' }, { status: 503 });
    console.error('Store load failed:', error);
    return NextResponse.json({ error: 'Unable to load the store.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { storeid } = await context.params;
    if (!validId(storeid)) return NextResponse.json({ error: 'Invalid store ID.' }, { status: 400 });
    const { companyCode, userId } = getTrustedStoreContext(admin);
    const input = normalizeStoreInput(await request.json());
    const errors = validateStoreInput(input);
    if (Object.keys(errors).length) return NextResponse.json({ error: 'Validation failed.', fields: errors }, { status: 400 });
    const store = await updateStore(storeid, input, companyCode, userId);
    return store ? NextResponse.json({ store }) : NextResponse.json({ error: 'Store not found.' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'COMPANY_CODE_NOT_CONFIGURED') return NextResponse.json({ error: 'Store company code is not configured on the server.' }, { status: 503 });
    console.error('Store update failed:', error);
    return NextResponse.json({ error: 'Unable to save the store.' }, { status: 500 });
  }
}
