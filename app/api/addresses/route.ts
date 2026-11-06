import { addressRequest } from '../../../lib/address-api';
export const GET = (request: Request) => addressRequest(request, 'list');
export const POST = (request: Request) => addressRequest(request, 'create');
