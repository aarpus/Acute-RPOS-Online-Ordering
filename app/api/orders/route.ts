import { orderRequest } from '../../../lib/order-http';
export const GET = (request: Request) => orderRequest(request, 'customer');
export const POST = (request: Request) => orderRequest(request, 'customer');
