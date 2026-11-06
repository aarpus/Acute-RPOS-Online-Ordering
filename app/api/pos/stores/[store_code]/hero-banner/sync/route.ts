import { syncPos } from '../../../../../../../lib/branding-pos';
export async function POST(request: Request, context: { params: Promise<{ store_code: string }> }) {
  return syncPos(request, 'HERO_BANNER', (await context.params).store_code);
}
