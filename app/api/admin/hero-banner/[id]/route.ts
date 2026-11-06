import { brandingAdmin } from '../../../../../lib/branding-admin';
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return brandingAdmin(request, 'hero', (await context.params).id); }
