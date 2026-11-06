import { brandingAdmin } from '../../../../../lib/branding-admin';
export async function GET(request: Request) { return brandingAdmin(request, 'workspace'); }
export async function PUT(request: Request) { return brandingAdmin(request, 'workspace'); }
