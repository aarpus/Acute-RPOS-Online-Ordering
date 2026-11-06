import { syncPosModifierGroups } from "../../../../../../../lib/pos-modifier-groups";
export async function POST(
  request: Request,
  context: { params: Promise<{ store_code: string }> },
) {
  return syncPosModifierGroups(request, (await context.params).store_code);
}
