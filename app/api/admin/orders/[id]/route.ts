import { orderRequest } from '../../../../../lib/order-http';
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) => orderRequest(request, 'admin', (await context.params).id);
export const POST = async (request: Request, context: Context) => orderRequest(request, 'admin', (await context.params).id);
