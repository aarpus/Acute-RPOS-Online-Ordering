import { jsonWithCookies, sameOrigin, serializeSessionCookie } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return jsonWithCookies({ error: 'Cross-origin logout requests are not allowed.' }, 403);
  }
  return jsonWithCookies({ message: 'Signed out.' }, 200, [serializeSessionCookie(null)]);
}
