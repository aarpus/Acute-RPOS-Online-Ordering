import { syncPosItems } from '../../../../../../../lib/pos-items';
export async function POST(request: Request, context: { params: Promise<{ store_code: string }> }) {
  return syncPosItems(request, (await context.params).store_code, 'combo');
}
