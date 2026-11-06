import { getStorefront } from '../../../lib/storefront';

export async function GET(request: Request) {
  try {
    return Response.json(await getStorefront(request), { headers: { 'Cache-Control': 'no-store', Vary: 'x-store-code, x-order-mode' } });
  } catch (error) {
    console.error('Unable to load storefront:', error);
    const configurationErrors: Record<string, string> = {
      'The selected store is unavailable. Select an active store.': 'The selected store is unavailable. Please select an active store from the database.',
      'Store codes must be unique. Update duplicate codes in the admin panel.': 'Duplicate store codes were found. Update them in the admin panel.',
    };
    const message = error instanceof Error ? configurationErrors[error.message] : undefined;
    return Response.json({ error: message || 'Unable to load stores. Please try again or contact the restaurant.' }, { status: 503, headers: { 'Cache-Control': 'no-store', Vary: 'x-store-code' } });
  }
}
