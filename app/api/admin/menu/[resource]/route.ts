import { menuAdmin } from '../../../../../lib/menu-admin';
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) { return menuAdmin(request, (await context.params).resource); }
export async function POST(request: Request, context: Context) { return menuAdmin(request, (await context.params).resource); }
