import { syncPosComboGroups } from '../../../../../../../lib/pos-combo-groups';
export async function POST(request: Request, context: { params: Promise<{ store_code: string }> }) {
  return syncPosComboGroups(request, (await context.params).store_code);
}
