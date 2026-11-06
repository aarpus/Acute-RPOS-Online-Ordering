import { menuAdmin } from '../../../../../../lib/menu-admin';
type Context = { params: Promise<{ resource: string; id: string }> };
export async function PATCH(request: Request, context: Context) { const { resource, id } = await context.params; return menuAdmin(request, resource, id); }
export async function DELETE(request: Request, context: Context) { const { resource, id } = await context.params; return menuAdmin(request, resource, id); }
