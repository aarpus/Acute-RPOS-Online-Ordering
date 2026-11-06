import { syncPosComboOptions } from '../../../../../../../lib/pos-combo-options';
export async function POST(request: Request, context: { params: Promise<{ store_code: string }> }) {
  return syncPosComboOptions(request, (await context.params).store_code);
}
