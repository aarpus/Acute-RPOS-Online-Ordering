import { managePosCredential } from '../../../../../../lib/pos-credentials';
type Context = { params: Promise<{ storeid: string }> };
export async function GET(request: Request, context: Context) { return managePosCredential(request, (await context.params).storeid); }
export async function PATCH(request: Request, context: Context) { return managePosCredential(request, (await context.params).storeid); }
export async function POST(request: Request, context: Context) { return managePosCredential(request, (await context.params).storeid); }
export async function DELETE(request: Request, context: Context) { return managePosCredential(request, (await context.params).storeid); }
