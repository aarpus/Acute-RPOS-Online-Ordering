import { getAuthenticatedAdmin, normalizeAdminEmail } from './admin-auth';
import { sameOrigin } from './auth';
import { withBrandingDb, ok, brandingResponse } from './branding';
import { BrandingError, limitedJson } from './branding-validation';
import { hashPassword } from './password';

const memberFields = { id: true, email: true, role: true, createdAt: true } as const;

export async function adminTeam(request: Request) {
  try {
    if (request.method !== 'GET' && !sameOrigin(request)) throw new BrandingError('Invalid origin.', 403);
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) throw new BrandingError('Authentication required.', 401);
    const isSuperAdmin = admin.role === 'super_admin';
    if (request.method === 'GET') {
      const members = await withBrandingDb(db => db.admin.findMany({
        where: { storeCode: admin.storeCode, ...(isSuperAdmin ? {} : { role: 'admin' }) }, select: memberFields, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }));
      return Response.json({ success: true, data: members, canAssignSuperAdmin: isSuperAdmin }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.method !== 'POST') throw new BrandingError('Method not allowed.', 405);
    const body = await limitedJson(request, 8192);
    const email = normalizeAdminEmail(body.email);
    const password = body.password;
    const role = body.role ?? 'admin';
    if (!isSuperAdmin && role !== 'admin') throw new BrandingError('You can only create Admin accounts.', 403);
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BrandingError('Enter a valid email address.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !password.trim()) throw new BrandingError('Password must contain 8–128 characters.');
    if (role !== 'admin' && role !== 'super_admin') throw new BrandingError('Select a valid admin role.');
    const passwordHash = await hashPassword(password);
    const member = await withBrandingDb(db => db.$transaction(async tx => {
      // Login identifies accounts by email, so reserve it across all companies.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-email:${email}`}, 0))::text`;
      if (await tx.admin.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })) throw new BrandingError('This email is already used by an admin account.', 409);
      return tx.admin.create({ data: { storeCode: admin.storeCode, email, passwordHash, role }, select: memberFields });
    }));
    return ok(member, 201);
  } catch (error) { return brandingResponse(error); }
}
