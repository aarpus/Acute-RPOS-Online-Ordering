import { brandingAdmin } from '../../../../../lib/branding-admin';
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return brandingAdmin(request, 'categories', (await context.params).id); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return brandingAdmin(request, 'categories', (await context.params).id); }
