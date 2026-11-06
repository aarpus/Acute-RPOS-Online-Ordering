import { syncPosImages } from '../../../../../../../lib/pos-images';
export async function POST(request: Request, context: { params: Promise<{ store_code: string }> }) {
  return syncPosImages(request, (await context.params).store_code);
}
