import type { PrismaClient } from '@prisma/client';
import { validateAddress } from './address';

export class AddressError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type AddressScope = { userId: string; storeCode: string };
export function listAddresses(db: Pick<PrismaClient, 'userAddress'>, scope: AddressScope) {
  return db.userAddress.findMany({ where: scope, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
}
export async function mutateAddress(db: PrismaClient, scope: AddressScope, action: 'create' | 'edit' | 'delete' | 'default', id?: string, body?: unknown) {
  if (action !== 'create' && (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new AddressError('Address not found.', 404);
  const data = action === 'create' || action === 'edit' ? validateAddress(body) : null;
  return db.$transaction(async tx => {
    // Lock the parent even when there are no addresses. Concurrent first-address
    // creation, deletion and default switches for this user are serialized.
    const users = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${scope.userId}::uuid AND store_code = ${scope.storeCode} FOR UPDATE`;
    if (!users.length) throw new AddressError('Please sign in again.', 401);
    const where = { ...scope, id };
    const existing = action === 'create' ? null : await tx.userAddress.findFirst({ where });
    if (action !== 'create' && !existing) throw new AddressError('Address not found.', 404);
    if (action === 'delete') {
      await tx.userAddress.deleteMany({ where });
      if (existing?.isDefault) {
        const replacement = await tx.userAddress.findFirst({ where: scope, orderBy: { createdAt: 'asc' } });
        if (replacement) await tx.userAddress.updateMany({ where: { ...scope, id: replacement.id }, data: { isDefault: true } });
      }
    } else {
      const isDefault = action === 'default' || data!.isDefault || (action === 'create' && await tx.userAddress.count({ where: scope }) === 0);
      if (isDefault) await tx.userAddress.updateMany({ where: { ...scope, isDefault: true }, data: { isDefault: false } });
      if (action === 'create') await tx.userAddress.create({ data: { ...data!, ...scope, isDefault } });
      else await tx.userAddress.updateMany({ where, data: action === 'default' ? { isDefault: true } : { ...data!, isDefault } });
    }
    return listAddresses(tx, scope);
  }, { timeout: 15000 });
}
