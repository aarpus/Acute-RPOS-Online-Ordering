import { syncPosModifierOptions } from '../../../../../../../lib/pos-modifier-options';
export async function POST(request: Request, context: { params: Promise<{ store_code: string }> }) {
  return syncPosModifierOptions(request, (await context.params).store_code);
}
