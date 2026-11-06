import { getAuthenticatedAdmin } from '../../../../lib/admin-auth';
import { getTrustedStoreContext } from '../../../../lib/admin-stores';
import { createPrismaClient } from '../../../../lib/prisma';
import { CustomerListError, customerListFilters, listRegisteredCustomers } from '../../../../lib/admin-customers';

export async function GET(request: Request) {
  const headers={'Cache-Control':'no-store'};
  try {
    const admin=await getAuthenticatedAdmin(request);
    if (!admin) return Response.json({error:'Authentication required.'},{status:401,headers});
    const {companyCode}=getTrustedStoreContext(admin);
    const filters=customerListFilters(new URL(request.url));
    const db=createPrismaClient();
    try {
      const data=await db.$transaction(tx=>listRegisteredCustomers(tx,companyCode,filters),{isolationLevel:'RepeatableRead',timeout:20000});
      return Response.json(data,{headers});
    } finally { await db.$disconnect(); }
  } catch (cause) {
    if (cause instanceof CustomerListError) return Response.json({error:cause.message},{status:cause.status,headers});
    console.error('Unable to load registered customers.');
    return Response.json({error:'Unable to load customers. Please retry.'},{status:503,headers});
  }
}
