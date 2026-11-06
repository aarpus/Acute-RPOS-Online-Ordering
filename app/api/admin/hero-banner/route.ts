import { brandingAdmin } from '../../../../lib/branding-admin';
export async function GET(request: Request) { return brandingAdmin(request, 'hero'); }
export async function POST(request: Request) { return brandingAdmin(request, 'hero'); }
