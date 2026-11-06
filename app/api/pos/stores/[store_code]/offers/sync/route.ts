import { syncPosOffers } from '../../../../../../../lib/pos-offers';
export async function POST(request: Request, context: { params: Promise<{ store_code: string }> }) {
  return syncPosOffers(request, (await context.params).store_code);
}
