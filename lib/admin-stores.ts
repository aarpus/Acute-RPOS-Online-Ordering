import { Prisma } from '@prisma/client';
import { env as workerEnv } from 'cloudflare:workers';
import { createPrismaClient } from './prisma';
import { envText } from './auth';

export const STORE_FIELD_LIMITS = {
  storename: 50,
  store_code: 50,
  storetime: 200,
  company_code: 50,
  storeaddress1: 200,
  storeaddress2: 200,
  storecity: 30,
  storestate: 20,
  storezipcode: 10,
  storephonenumber: 15,
  storefaxnumber: 15,
  storeaccountnumber: 30,
  storeroutingnumber: 30,
} as const;

export type StoreInput = {
  storename: string;
  store_code: string;
  storetime: string;
  storeaddress1: string;
  storeaddress2: string;
  storecity: string;
  storestate: string;
  storezipcode: string;
  storephonenumber: string;
  storefaxnumber: string;
  storeaccountnumber: string;
  storeroutingnumber: string;
  is_active: boolean;
};

export type StoreRecord = {
  storeid: string;
  storename: string | null;
  store_code: string | null;
  storetime: string | null;
  company_code: string | null;
  storeaddress1: string | null;
  storeaddress2: string | null;
  storecity: string | null;
  storestate: string | null;
  storezipcode: string | null;
  storephonenumber: string | null;
  storefaxnumber: string | null;
  storeaccountnumber: string | null;
  storeroutingnumber: string | null;
  is_active: boolean;
  created_by: number;
  created_on: string;
  updated_by: number | null;
  updated_on: string | null;
  is_delete: boolean | null;
};

export function getTrustedStoreContext(admin: { storeCode: string }) {
  const configuredUserId = envText(workerEnv.ADMIN_USER_ID) || envText(process.env.ADMIN_USER_ID);
  const userId = configuredUserId ? Number(configuredUserId) : 0;
  if (!Number.isSafeInteger(userId) || userId < 0) throw new Error('ADMIN_USER_ID_INVALID');

  const companyCode = envText(workerEnv.COMPANY_CODE) || envText(process.env.COMPANY_CODE) || admin.storeCode;
  if (!companyCode || companyCode.length > STORE_FIELD_LIMITS.company_code) throw new Error('COMPANY_CODE_NOT_CONFIGURED');
  return { userId, companyCode };
}

export function normalizeStoreInput(value: unknown): StoreInput {
  const body = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const text = (name: keyof StoreInput) => String(body[name] ?? '').trim();
  return {
    storename: text('storename'),
    store_code: text('store_code'),
    storetime: String(body.storetime ?? ''),
    storeaddress1: text('storeaddress1'),
    storeaddress2: text('storeaddress2'),
    storecity: text('storecity'),
    storestate: text('storestate'),
    storezipcode: text('storezipcode'),
    storephonenumber: text('storephonenumber'),
    storefaxnumber: text('storefaxnumber'),
    storeaccountnumber: text('storeaccountnumber'),
    storeroutingnumber: text('storeroutingnumber'),
    is_active: body.is_active === undefined ? true : body.is_active === true,
  };
}

export function validateStoreInput(input: StoreInput) {
  const errors: Record<string, string> = {};
  if (!input.storename) errors.storename = 'Store Name is required.';
  for (const [field, limit] of Object.entries(STORE_FIELD_LIMITS)) {
    const value = field === 'company_code' ? '' : input[field as keyof StoreInput];
    if (typeof value === 'string' && value.length > limit) errors[field] = `Maximum ${limit} characters.`;
  }
  if (!input.store_code) errors.store_code = 'Store Code is required.';
  return errors;
}

const storeSelect = Prisma.sql`
  storeid::text AS storeid, storename, store_code, storetime, company_code,
  storeaddress1, storeaddress2, storecity, storestate, storezipcode,
  storephonenumber, storefaxnumber, storeaccountnumber, storeroutingnumber, is_active, created_by,
  created_on::text AS created_on, updated_by, updated_on::text AS updated_on, is_delete
`;

function nullable(value: string) { return value === '' ? null : value; }

export async function listStores(companyCode: string) {
  const prisma = createPrismaClient();
  try {
    return await prisma.$queryRaw<StoreRecord[]>(Prisma.sql`SELECT ${storeSelect} FROM public.tbl_store WHERE company_code = ${companyCode} AND COALESCE(is_delete, false) = false ORDER BY storename NULLS LAST, storeid`);
  } finally { await prisma.$disconnect(); }
}

export async function findStore(storeId: string, companyCode: string) {
  const prisma = createPrismaClient();
  try {
    const rows = await prisma.$queryRaw<StoreRecord[]>(Prisma.sql`SELECT ${storeSelect} FROM public.tbl_store WHERE storeid = ${storeId}::bigint AND company_code = ${companyCode} AND COALESCE(is_delete, false) = false`);
    return rows[0] ?? null;
  } finally { await prisma.$disconnect(); }
}

export async function storeCodeExists(storeCode: string, excludeStoreId?: string) {
  const prisma = createPrismaClient();
  try {
    const excludeStore = excludeStoreId ? Prisma.sql`AND storeid <> ${excludeStoreId}::bigint` : Prisma.empty;
    const rows = await prisma.$queryRaw<{ storeid: string }[]>(Prisma.sql`
      SELECT storeid::text AS storeid
      FROM public.tbl_store
      WHERE store_code = ${storeCode} AND COALESCE(is_delete, false) = false
      ${excludeStore}
      LIMIT 1
    `);
    return rows.length > 0;
  } finally { await prisma.$disconnect(); }
}

export async function createStore(input: StoreInput, companyCode: string, userId: number) {
  const prisma = createPrismaClient();
  try {
    const rows = await prisma.$queryRaw<StoreRecord[]>(Prisma.sql`
      INSERT INTO public.tbl_store
        (storename, store_code, storetime, company_code, storeaddress1, storeaddress2, storecity, storestate, storezipcode, storephonenumber, storefaxnumber, storeaccountnumber, storeroutingnumber, is_active, created_by, is_delete)
      VALUES
        (${input.storename}, ${nullable(input.store_code)}, ${nullable(input.storetime)}, ${companyCode}, ${nullable(input.storeaddress1)}, ${nullable(input.storeaddress2)}, ${nullable(input.storecity)}, ${nullable(input.storestate)}, ${nullable(input.storezipcode)}, ${nullable(input.storephonenumber)}, ${nullable(input.storefaxnumber)}, ${nullable(input.storeaccountnumber)}, ${nullable(input.storeroutingnumber)}, ${input.is_active}, ${userId}, false)
      RETURNING ${storeSelect}`);
    return rows[0];
  } finally { await prisma.$disconnect(); }
}

export async function updateStore(storeId: string, input: StoreInput, companyCode: string, userId: number) {
  const prisma = createPrismaClient();
  try {
    const rows = await prisma.$queryRaw<StoreRecord[]>(Prisma.sql`
      UPDATE public.tbl_store SET
        storename = ${input.storename}, store_code = ${nullable(input.store_code)}, storetime = ${nullable(input.storetime)}, company_code = ${companyCode},
        storeaddress1 = ${nullable(input.storeaddress1)}, storeaddress2 = ${nullable(input.storeaddress2)}, storecity = ${nullable(input.storecity)},
        storestate = ${nullable(input.storestate)}, storezipcode = ${nullable(input.storezipcode)}, storephonenumber = ${nullable(input.storephonenumber)},
        storefaxnumber = ${nullable(input.storefaxnumber)}, storeaccountnumber = ${nullable(input.storeaccountnumber)},
        storeroutingnumber = ${nullable(input.storeroutingnumber)}, is_active = ${input.is_active}, updated_by = ${userId}, updated_on = NOW()
      WHERE storeid = ${storeId}::bigint AND company_code = ${companyCode} AND COALESCE(is_delete, false) = false
      RETURNING ${storeSelect}`);
    return rows[0] ?? null;
  } finally { await prisma.$disconnect(); }
}
