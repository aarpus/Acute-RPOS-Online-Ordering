import { syncPosModifierLinks } from '../../../../../../../lib/pos-modifier-links';
export async function POST(request: Request, context: { params: Promise<{ store_code: string }> }) {
  return syncPosModifierLinks(request, (await context.params).store_code);
}
