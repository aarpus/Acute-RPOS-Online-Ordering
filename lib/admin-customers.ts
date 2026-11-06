import type { Prisma } from '@prisma/client';

export class CustomerListError extends Error { constructor(message: string, public status=400) { super(message); } }
export function customerListFilters(url: URL) {
  const page=Number(url.searchParams.get('page')||1);
  const pageSize=Number(url.searchParams.get('page_size')||25);
  const query=(url.searchParams.get('q')||'').trim();
  const storeCode=(url.searchParams.get('store_code')||'').trim();
  if (!Number.isSafeInteger(page)||page<1||page>1000000) throw new CustomerListError('Choose a valid page number.');
  if (![10,25,50].includes(pageSize)) throw new CustomerListError('Choose 10, 25 or 50 customers per page.');
  if (query.length>200||storeCode.length>50) throw new CustomerListError('Search or store code is too long.');
  return {page,pageSize,query,storeCode};
}

export async function listRegisteredCustomers(db: Prisma.TransactionClient, companyCode: string, filters: ReturnType<typeof customerListFilters>) {
  const companyStores=await db.store.findMany({where:{company_code:companyCode,OR:[{is_delete:false},{is_delete:null}]},select:{store_code:true,storename:true},orderBy:{storeid:'asc'}});
  const codes=[...new Set(companyStores.map(store=>store.store_code?.trim()).filter((code):code is string=>!!code))];
  // User accounts are keyed by store code. Ambiguous codes cannot safely be
  // assigned to one company, so exclude them even if one store is authorized.
  const counts=codes.length ? await db.store.groupBy({by:['store_code'],where:{store_code:{in:codes},OR:[{is_delete:false},{is_delete:null}]},_count:{_all:true}}) : [];
  const stores=companyStores.filter(store=>store.store_code && counts.some(row=>row.store_code===store.store_code && row._count._all===1)).map(store=>({code:store.store_code!,name:store.storename||store.store_code!}));
  if (filters.storeCode && !stores.some(store=>store.code===filters.storeCode)) throw new CustomerListError('You do not have access to this store.',403);
  const where: Prisma.UserWhereInput={storeCode:{in:filters.storeCode?[filters.storeCode]:stores.map(store=>store.code)}};
  if (filters.query) where.OR=[
    ...['firstName','lastName','email','phoneNumber'].map(field=>({[field]:{contains:filters.query,mode:'insensitive'}})),
    {AND:filters.query.split(/\s+/).map(word=>({OR:[{firstName:{contains:word,mode:'insensitive' as const}},{lastName:{contains:word,mode:'insensitive' as const}}]}))},
  ];
  const total=await db.user.count({where});
  const totalPages=Math.max(1,Math.ceil(total/filters.pageSize));
  const page=Math.min(filters.page,totalPages);
  const customers=await db.user.findMany({where,select:{id:true,storeCode:true,firstName:true,lastName:true,phoneNumber:true,email:true,createdAt:true,updatedAt:true},orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(page-1)*filters.pageSize,take:filters.pageSize});
  return {customers:customers.map(customer=>({...customer,storeName:stores.find(store=>store.code===customer.storeCode)!.name})),stores,total,page,pageSize:filters.pageSize,totalPages};
}
