import { addressRequest } from '../../../../lib/address-api';
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) { return addressRequest(request, 'edit', (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return addressRequest(request, 'delete', (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return addressRequest(request, 'default', (await context.params).id); }
