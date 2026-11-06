import { adminContext, withBrandingDb, ok, brandingResponse } from '../../../../../lib/branding';
import { menuCreateAccess } from '../../../../../lib/menu-create-access';

export async function GET(request: Request) {
  try {
    const { storeCode } = await adminContext(request);
    return ok(await withBrandingDb(db => menuCreateAccess(db, storeCode)));
  } catch (error) { return brandingResponse(error); }
}
