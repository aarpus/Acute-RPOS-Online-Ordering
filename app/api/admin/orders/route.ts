import { orderRequest } from '../../../../lib/order-http';
export const GET = (request: Request) => orderRequest(request, 'admin');
