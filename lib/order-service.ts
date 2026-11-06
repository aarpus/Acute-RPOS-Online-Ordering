import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient, type OrderStatus } from '@prisma/client';
import type { HomeData } from '../data/home';
import { emptyCustomer, orderTotals, unitPrice, validSchedule, type CartItem, type Customer, type Schedule, type SavedOrder } from './order';
import { publicMenu, scheduledInstant, validateCatalogCart, zonedParts } from './menu-public';
import { validUSState, zipPattern } from './address';

export class OrderError extends Error {
  constructor(message: string, public status = 400, public details: Record<string, unknown> = {}) { super(message); }
}
type Tx = Prisma.TransactionClient;
type User = { id: string; email: string };
type Storefront = HomeData & { store: HomeData['store'] & { code: string } };
type Input = {
  items: { productId: string; sizeId: string; extraIds: string[]; instructions: string; quantity: number }[];
  mode: string; customer: Customer; schedule: Schedule; paymentMethod: string;
  promo: string; expectedTotal: number; quotedUnitPrices: number[]; idempotencyKey: string;
};
type Allocation = { key: string; quantity: string };
const include = {
  items: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }], include: { options: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] } } },
  statusHistory: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  otps: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} satisfies Prisma.OrderInclude;
type Row = Prisma.OrderGetPayload<{ include: typeof include }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validOrderId = (value: string) => uuid.test(value);
export async function lockOrders(tx: Tx, storeCode: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'orders:' + storeCode}, 0))::text`;
}
export function orderView(row: Row, admin = false): SavedOrder {
  const snapshot = (row.storeSnapshot ?? {}) as Record<string, string>;
  const address = (row.deliveryAddress ?? {}) as Partial<Customer>;
  const customer: Customer = { ...emptyCustomer, ...address, name: row.customerName, phone: row.customerPhone, instructions: row.deliveryInstructions ?? row.customerNotes ?? '' };
  const local = row.scheduledAt ? zonedParts(row.scheduledAt, snapshot.timezone || 'America/Los_Angeles') : { date: '', time: '' };
  const items: CartItem[] = row.items.map(line => {
    const variant = line.options.find(option => option.optionType === 'variant');
    const extras = line.options.filter(option => option.optionType !== 'variant').map(option => ({
      id: option.selectionKey || (option.optionType === 'combo' ? 'combo:' + (option.sourceOptionId || option.id) : option.sourceOptionId || option.id),
      name: option.optionName, price: Number(option.additionalUnitPrice),
    }));
    const sizeId = variant?.sourceOptionId || 'base';
    return {
      id: line.id, sizeId, extraIds: extras.map(extra => extra.id), instructions: line.specialInstructions || '', quantity: line.quantity,
      product: { id: line.menuItemId, name: line.itemName, image: line.itemImageUrl || '/images/category-0.jpg', gallery: [line.itemImageUrl || '/images/category-0.jpg'], description: '', price: Number(line.baseUnitPrice),
        categoryId: '', popular: false, sizes: [{ id: sizeId, name: variant?.optionName || 'Regular', price: Number(line.baseUnitPrice) }], extras },
    };
  });
  const otp = row.otps[0];
  return {
    id: row.id, orderNumber: row.orderNumber, storeCode: row.storeCode, storeName: snapshot.name || row.storeCode,
    storeAddress: snapshot.address || '', createdAt: row.createdAt.toISOString(), mode: row.orderType === 'pickup' ? 'Pickup' : 'Delivery',
    customer, customerEmail: row.customerEmail, currency: row.currency,
    schedule: { timing: row.timing === 'scheduled' ? 'later' : 'asap', ...local },
    paymentMethod: row.orderType === 'pickup' ? 'Pay at pickup' : 'Cash on delivery', paymentStatus: row.paymentStatus,
    status: row.status, demo: false, items,
    totals: { subtotal: Number(row.subtotal), discount: Number(row.discountAmount), fee: Number(row.deliveryFee), total: Number(row.grandTotal) },
    confirmationSentAt: row.confirmationSentAt?.toISOString() ?? null,
    history: row.statusHistory.map(event => ({ id: event.id, fromStatus: event.fromStatus, toStatus: event.toStatus, reason: event.reason, createdAt: event.createdAt.toISOString() })),
    ...(admin ? { otp: otp ? { status: otp.status, expiresAt: otp.expiresAt.toISOString(), lastSentAt: otp.lastSentAt?.toISOString() ?? null, attemptsRemaining: Math.max(0, otp.maxAttempts - otp.attemptCount) } : null } : {}),
  };
}
export async function getOrder(db: PrismaClient | Tx, storeCode: string | string[], id: string, userId?: string, admin = false) {
  if (!validOrderId(id)) throw new OrderError('Order not found.', 404);
  const row = await db.order.findFirst({ where: { id, storeCode: Array.isArray(storeCode) ? { in: storeCode } : storeCode, ...(userId ? { userId } : {}) }, include });
  if (!row) throw new OrderError('Order not found.', 404);
  return orderView(row, admin);
}
export async function listOrders(db: PrismaClient, storeCode: string | string[], options: { userId?: string; page?: number; query?: string; status?: string; payment?: string; mode?: string; admin?: boolean } = {}) {
  const page = Math.max(1, Math.floor(options.page || 1));
  const statuses: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
  if (options.status && !statuses.includes(options.status as OrderStatus)) throw new OrderError('Invalid status filter.');
  if (options.payment && !['pending', 'paid'].includes(options.payment)) throw new OrderError('Invalid payment filter.');
  if (options.mode && !['pickup', 'delivery'].includes(options.mode)) throw new OrderError('Invalid order type filter.');
  const where: Prisma.OrderWhereInput = {
    storeCode: Array.isArray(storeCode) ? { in: storeCode } : storeCode, ...(options.userId ? { userId: options.userId } : {}),
    ...(options.status ? { status: options.status as OrderStatus } : {}),
    ...(options.payment ? { paymentStatus: options.payment as 'pending' | 'paid' } : {}),
    ...(options.mode ? { orderType: options.mode as 'pickup' | 'delivery' } : {}),
    ...(options.query ? { OR: [{ orderNumber: { contains: options.query.slice(0, 150), mode: 'insensitive' } }, { customerName: { contains: options.query.slice(0, 150), mode: 'insensitive' } }, ...(validOrderId(options.query) ? [{ id: options.query }] : [])] } : {}),
  };
  const [rows, total] = await db.$transaction([
    db.order.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 }),
    db.order.count({ where }),
  ]);
  return { orders: rows.map(row => orderView(row, options.admin)), page, total, pageSize: 20 };
}
function input(value: unknown): Input {
  if (!value || typeof value !== 'object') throw new OrderError('Invalid order.');
  const body = value as Input;
  if (typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.idempotencyKey)) throw new OrderError('Invalid checkout attempt. Refresh and try again.');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw new OrderError('Your cart is empty or invalid.');
  if (!['Pickup', 'Delivery'].includes(body.mode)) throw new OrderError('Choose delivery or pickup.');
  if (!['cash', 'pay_at_pickup', 'cash_on_delivery'].includes(body.paymentMethod)) throw new OrderError('Only cash or pay at pickup is available.');
  if (body.promo) throw new OrderError('Coupon redemption is not available.');
  if (!body.schedule || !['asap', 'later'].includes(body.schedule.timing) || typeof body.schedule.date !== 'string' || typeof body.schedule.time !== 'string') throw new OrderError('Choose a valid schedule.');
  const schedule: Schedule = body.schedule.timing === 'asap' ? { timing: 'asap', date: '', time: '' } : { timing: 'later', date: body.schedule.date, time: body.schedule.time };
  const c = body.customer;
  if (!c || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 150 || typeof c.phone !== 'string' || !/^[+0-9 ()-]{7,25}$/.test(c.phone) || c.phone.replace(/\D/g, '').length < 7) throw new OrderError('Enter a valid name and phone number.');
  const customer: Customer = { ...emptyCustomer, name: c.name.trim(), phone: c.phone.trim() };
  for (const key of ['street', 'apartment', 'city', 'postalCode', 'instructions', 'state', 'country', 'landmark'] as const) {
    const value = c[key] ?? '';
    if (typeof value !== 'string' || value.length > (key === 'instructions' || key === 'street' ? 200 : 150)) throw new OrderError('Invalid contact or address details.');
    customer[key] = value.trim();
  }
  if (body.mode === 'Delivery' && (!customer.street || !customer.city || !zipPattern.test(customer.postalCode) || !validUSState(customer.state) || customer.country && customer.country !== 'US')) throw new OrderError('Complete your delivery address with a valid US state and ZIP Code.');
  if (body.mode === 'Delivery') customer.country = 'US';
  const items = body.items.map(entry => {
    if (!entry || typeof entry.productId !== 'string' || !uuid.test(entry.productId) || typeof entry.sizeId !== 'string' || entry.sizeId.length > 100 || !Array.isArray(entry.extraIds) || entry.extraIds.length > 100 || entry.extraIds.some(id => typeof id !== 'string' || id.length > 150) || new Set(entry.extraIds).size !== entry.extraIds.length || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 99 || typeof entry.instructions !== 'string' || entry.instructions.length > 250) throw new OrderError('Invalid cart item.');
    return { productId: entry.productId, sizeId: entry.sizeId, extraIds: [...entry.extraIds].sort(), instructions: entry.instructions, quantity: entry.quantity };
  });
  if (!Number.isFinite(body.expectedTotal) || !Array.isArray(body.quotedUnitPrices) || body.quotedUnitPrices.length !== items.length || body.quotedUnitPrices.some(price => !Number.isFinite(price))) throw new OrderError('Invalid price quote.');
  return { items, mode: body.mode, customer, schedule, paymentMethod: 'cash', promo: '', expectedTotal: body.expectedTotal, quotedUnitPrices: body.quotedUnitPrices, idempotencyKey: body.idempotencyKey };
}
export async function createOrder(db: PrismaClient, storefront: Storefront, user: User, value: unknown) {
  const body = input(value), storeCode = storefront.store.code;
  const requestHash = createHash('sha256').update(JSON.stringify({ storeCode, userId: user.id, ...body })).digest('hex');
  return db.$transaction(async tx => {
    await lockOrders(tx, storeCode);
    const existing = await tx.order.findUnique({ where: { storeCode_idempotencyKey: { storeCode, idempotencyKey: body.idempotencyKey } }, include });
    if (existing) {
      if (existing.userId !== user.id || existing.checkoutRequestHash !== requestHash) throw new OrderError('This checkout attempt was already used. Review your cart and try again.', 409);
      return { order: orderView(existing), created: false };
    }
    if (!validSchedule(body.schedule, storefront)) throw new OrderError('Choose an available future time.');
    const at = scheduledInstant(body.schedule, storefront.store.timezone);
    const catalog = await publicMenu(tx, storeCode, storefront.store.currency, body.mode, at);
    const items: CartItem[] = body.items.map((entry, index) => {
      const product = catalog.products.find(product => product.id === entry.productId);
      if (!product || !product.sizes.some(size => size.id === entry.sizeId)) throw new OrderError('An item or size is unavailable. Refresh your cart.', 409);
      return { id: String(index), product, sizeId: entry.sizeId, extraIds: entry.extraIds, instructions: entry.instructions, quantity: entry.quantity };
    });
    validateCatalogCart(items);
    const totals = orderTotals(items, body.mode, '', storefront);
    if (body.expectedTotal !== totals.total || items.some((item, i) => body.quotedUnitPrices[i] !== unitPrice(item))) {
      throw new OrderError('Menu prices changed. Review the refreshed total and confirm again.', 409, { items, totals });
    }
    const allocations: Allocation[][] = [];
    const combined = new Map<string, Prisma.Decimal>();
    for (const item of items) {
      const size = item.product.sizes.find(size => size.id === item.sizeId)!;
      const needs = [...(size.stock || []), ...item.product.extras.filter(extra => item.extraIds.includes(extra.id)).flatMap(extra => extra.stock || [])];
      const line = new Map<string, Prisma.Decimal>();
      for (const need of needs) line.set(need.key, (line.get(need.key) || new Prisma.Decimal(0)).add(new Prisma.Decimal(need.units).mul(item.quantity)));
      allocations.push([...line].map(([key, quantity]) => ({ key, quantity: quantity.toFixed(3) })));
      for (const [key, quantity] of line) combined.set(key, (combined.get(key) || new Prisma.Decimal(0)).add(quantity));
    }
    for (const [key, required] of [...combined].sort(([a], [b]) => a.localeCompare(b))) {
      await tx.$queryRaw`SELECT id FROM menu_item_inventory WHERE id = ${key}::uuid AND store_code = ${storeCode} FOR UPDATE`;
      const stock = await tx.menuItemInventory.findUnique({ where: { storeCode_id: { storeCode, id: key } } });
      if (!stock || !stock.trackInventory || stock.archivedAt || stock.stockStatus === 'out_of_stock' || !stock.allowBackorder && new Prisma.Decimal(stock.quantityAvailable ?? 0).lt(required)) throw new OrderError('Stock changed. Refresh your cart and try again.', 409);
      await tx.menuItemInventory.update({ where: { id: key }, data: { quantityAvailable: new Prisma.Decimal(stock.quantityAvailable ?? 0).sub(required) } });
    }
    const id = randomUUID(), orderNumber = 'ST-' + id.replaceAll('-', '').slice(0, 12).toUpperCase();
    const row = await tx.order.create({
      data: {
        id, storeCode, orderNumber, userId: user.id, orderType: body.mode === 'Pickup' ? 'pickup' : 'delivery',
        customerName: body.customer.name, customerPhone: body.customer.phone, customerEmail: user.email,
        deliveryAddress: body.customer as unknown as Prisma.InputJsonValue, deliveryInstructions: body.customer.instructions,
        timing: body.schedule.timing === 'later' ? 'scheduled' : 'asap', scheduledAt: body.schedule.timing === 'later' ? at : null,
        currency: storefront.store.currency, subtotal: totals.subtotal, discountAmount: 0, taxAmount: 0, deliveryFee: totals.fee, grandTotal: totals.total,
        idempotencyKey: body.idempotencyKey, checkoutRequestHash: requestHash,
        storeSnapshot: { name: storefront.store.name, address: storefront.store.address, timezone: storefront.store.timezone },
        items: { create: await Promise.all(items.map(async (item, index) => {
          const size = item.product.sizes.find(size => size.id === item.sizeId)!;
          const extras = item.product.extras.filter(extra => item.extraIds.includes(extra.id));
          const sourceItem = await tx.menuItem.findUniqueOrThrow({ where: { storeCode_id: { storeCode, id: item.product.id } }, select: { sku: true } });
          const selectedCombos = await tx.menuComboOption.findMany({ where: { storeCode, id: { in: extras.filter(extra => extra.id.startsWith('combo:')).map(extra => extra.id.slice(6)) }, archivedAt: null }, select: { id: true, quantity: true } });
          const fixed = await tx.menuComboGroup.findMany({ where: { storeCode, comboItemId: item.product.id, archivedAt: null, selectionType: 'fixed' }, include: { options: { where: { archivedAt: null, isAvailable: true } } } });
          const options: Prisma.OrderItemOptionUncheckedCreateWithoutOrderItemInput[] = [
            { optionType: 'variant', sourceOptionId: uuid.test(size.id) ? size.id : null, groupName: 'Size', optionName: size.name, quantity: 1, additionalUnitPrice: 0 },
            ...extras.map(extra => ({ optionType: (extra.id.startsWith('combo:') ? 'combo' : 'modifier') as 'combo' | 'modifier', sourceOptionId: extra.id.split(':').at(-1)!, selectionKey: extra.id, groupName: item.product.optionGroups?.find(group => group.options.includes(extra.id))?.name, optionName: extra.name, quantity: selectedCombos.find(option => 'combo:' + option.id === extra.id)?.quantity ?? 1, additionalUnitPrice: extra.price })),
            ...fixed.flatMap(group => group.options.map(option => ({ optionType: 'combo' as const, sourceOptionId: option.id, selectionKey: 'fixed:' + option.id, groupName: group.groupName, optionName: Number(option.quantity) + ' × ' + option.optionName, quantity: option.quantity, additionalUnitPrice: 0 }))),
          ];
          return { menuItemId: item.product.id, sku: sourceItem.sku, itemName: item.product.name, itemImageUrl: item.product.image, quantity: item.quantity,
            baseUnitPrice: size.price, optionsUnitTotal: extras.reduce((n, extra) => n + Math.round(extra.price * 100), 0) / 100, unitPrice: unitPrice(item),
            subtotal: Math.round(unitPrice(item) * 100) * item.quantity / 100, lineTotal: Math.round(unitPrice(item) * 100) * item.quantity / 100,
            specialInstructions: item.instructions, inventoryAllocations: allocations[index], options: { create: options } };
        })) },
        transactions: { create: { paymentMethod: body.mode === 'Pickup' ? 'pay_at_pickup' : 'cash_on_delivery', amount: totals.total, currency: storefront.store.currency, idempotencyKey: 'cash-' + id } },
        statusHistory: { create: { toStatus: 'placed', actorType: 'customer', actorUserId: user.id } },
      }, include,
    });
    return { order: orderView(row), created: true };
  }, { timeout: 20000 });
}

export type Mailer = (message: { to: string; subject: string; text: string; html: string }) => Promise<void>;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export async function sendConfirmation(db: PrismaClient, storeCode: string, id: string, send: Mailer, retry = false) {
  const claimed = await db.$transaction(async tx => {
    await lockOrders(tx, storeCode);
    const row = await tx.order.findFirst({ where: { id, storeCode } });
    if (!row) throw new OrderError('Order not found.', 404);
    if (!retry && row.confirmationSentAt) return false;
    if (row.confirmationAttemptAt && Date.now() - row.confirmationAttemptAt.getTime() < 60000) throw new OrderError('Wait one minute before sending again.', 429);
    await tx.order.update({ where: { id }, data: { confirmationAttemptAt: new Date() } });
    return true;
  });
  if (!claimed) return;
  const order = await getOrder(db, storeCode, id);
  const text = 'Order ' + order.orderNumber + ' has been placed at ' + order.storeName + '.\n' + order.items.map(item => item.quantity + ' × ' + item.product.name + ' — ' + unitPrice(item).toFixed(2)).join('\n') + '\nTotal: ' + order.currency + ' ' + order.totals.total.toFixed(2) + '\nPayment: ' + order.paymentMethod + '.\nStatus: ' + order.status;
  await send({ to: order.customerEmail, subject: 'Order confirmation ' + order.orderNumber, text, html: '<p>' + escapeHtml(text).replaceAll('\n', '<br>') + '</p>' });
  await db.order.update({ where: { id }, data: { confirmationSentAt: new Date() } });
}
const terminal = (status: OrderStatus) => status === 'completed' || status === 'cancelled';
async function editable(tx: Tx, storeCode: string, id: string) {
  if (!uuid.test(id)) throw new OrderError('Order not found.', 404);
  const row = await tx.order.findFirst({ where: { id, storeCode }, include: { items: true } });
  if (!row) throw new OrderError('Order not found.', 404);
  return row;
}
export async function changeOrder(db: PrismaClient, storeCode: string, id: string, adminId: string, action: string, value: unknown) {
  const body = value as { status?: string; reason?: string };
  return db.$transaction(async tx => {
    await lockOrders(tx, storeCode);
    const row = await editable(tx, storeCode, id);
    if (terminal(row.status)) throw new OrderError('This order is already closed.', 409);
    if (action === 'payment') {
      if (row.paymentStatus === 'paid') return getOrder(tx, storeCode, id, undefined, true);
      const payment = await tx.orderTransaction.findUnique({ where: { storeCode_idempotencyKey: { storeCode, idempotencyKey: 'cash-' + id } } });
      if (!payment || payment.status !== 'pending') throw new OrderError('Payment record is unavailable.', 409);
      await tx.orderTransaction.update({ where: { id: payment.id }, data: { status: 'success', paidAt: new Date(), collectedByAdminId: adminId } });
      await tx.order.update({ where: { id }, data: { paymentStatus: 'paid' } });
      await tx.orderStatusHistory.create({ data: { storeCode, orderId: id, fromStatus: row.status, toStatus: row.status, actorType: 'admin', actorAdminId: adminId, reason: 'Cash payment received.' } });
    } else if (action === 'status') {
      const next: Partial<Record<OrderStatus, OrderStatus>> = { placed: 'accepted', accepted: 'preparing', preparing: 'ready', ...(row.orderType === 'delivery' ? { ready: 'out_for_delivery' as const } : {}) };
      if (body.status === 'cancelled') {
        if (row.paymentStatus === 'paid') throw new OrderError('Paid orders cannot be cancelled here.', 409);
        if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500) throw new OrderError('Enter a cancellation reason (maximum 500 characters).');
        for (const item of row.items) for (const allocation of (item.inventoryAllocations || []) as Allocation[]) {
          await tx.$queryRaw`SELECT id FROM menu_item_inventory WHERE id = ${allocation.key}::uuid AND store_code = ${storeCode} FOR UPDATE`;
          const inventory = await tx.menuItemInventory.findUnique({ where: { storeCode_id: { storeCode, id: allocation.key } } });
          if (!inventory) throw new OrderError('Inventory restoration needs attention.', 409);
          await tx.menuItemInventory.update({ where: { id: inventory.id }, data: { quantityAvailable: new Prisma.Decimal(inventory.quantityAvailable ?? 0).add(allocation.quantity) } });
        }
        await tx.orderTransaction.updateMany({ where: { orderId: id, storeCode, status: 'pending' }, data: { status: 'cancelled' } });
        await tx.orderOtp.updateMany({ where: { orderId: id, storeCode, status: 'active' }, data: { status: 'revoked' } });
      } else if (!body.status || body.status !== next[row.status]) throw new OrderError('Invalid status transition. Completion requires email OTP.', 409);
      const toStatus = body.status as OrderStatus;
      await tx.order.update({ where: { id }, data: { status: toStatus, ...(toStatus === 'cancelled' ? { cancelledAt: new Date(), cancellationReason: body.reason!.trim() } : {}) } });
      await tx.orderStatusHistory.create({ data: { storeCode, orderId: id, fromStatus: row.status, toStatus, actorType: 'admin', actorAdminId: adminId, reason: toStatus === 'cancelled' ? body.reason!.trim() : null } });
    } else throw new OrderError('Unknown order action.');
    return getOrder(tx, storeCode, id, undefined, true);
  }, { timeout: 20000 });
}
function otpDigest(secret: string, storeCode: string, orderId: string, otpId: string, code: string) {
  return createHmac('sha256', secret).update(['order-handover', storeCode, orderId, otpId, code].join('\0')).digest('hex');
}
function handover(row: { orderType: string; status: OrderStatus }) {
  return row.orderType === 'pickup' ? row.status === 'ready' : row.status === 'out_for_delivery';
}
export async function sendOrderOtp(db: PrismaClient, storeCode: string, id: string, secret: string, send: Mailer) {
  const code = randomInt(0, 1000000).toString().padStart(6, '0'), otpId = randomUUID();
  const otp = await db.$transaction(async tx => {
    await lockOrders(tx, storeCode);
    const order = await editable(tx, storeCode, id);
    if (!handover(order)) throw new OrderError('This order is not ready for handover.', 409);
    const previous = await tx.orderOtp.findFirst({ where: { storeCode, orderId: id }, orderBy: { createdAt: 'desc' } });
    if (previous && Date.now() - previous.createdAt.getTime() < 60000) throw new OrderError('Wait one minute before requesting another OTP.', 429);
    await tx.orderOtp.updateMany({ where: { storeCode, orderId: id, status: 'active' }, data: { status: 'revoked' } });
    const now = new Date();
    await tx.orderOtp.create({ data: { id: otpId, storeCode, orderId: id, purpose: order.orderType === 'pickup' ? 'pickup_handover' : 'delivery_handover', otpHash: otpDigest(secret, storeCode, id, otpId, code), recipientEmail: order.customerEmail, createdAt: now, expiresAt: new Date(now.getTime() + 600000) } });
    return { email: order.customerEmail, number: order.orderNumber };
  });
  try {
    const text = 'Your handover OTP for order ' + otp.number + ' is ' + code + '. It expires in 10 minutes. Share it with staff only when collecting or receiving your order.';
    await send({ to: otp.email, subject: 'Order handover code ' + otp.number, text, html: '<p>' + escapeHtml(text) + '</p>' });
    await db.orderOtp.updateMany({ where: { id: otpId }, data: { lastSentAt: new Date(), sendCount: 1 } });
  } catch {
    await db.orderOtp.updateMany({ where: { id: otpId, status: 'active' }, data: { status: 'revoked' } });
    throw new OrderError('The order is saved, but the OTP email could not be sent. Retry after one minute.', 502);
  }
}
export async function verifyOrderOtp(db: PrismaClient, storeCode: string, id: string, adminId: string, secret: string, code: unknown) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new OrderError('Enter the six-digit OTP.');
  const result = await db.$transaction(async tx => {
    await lockOrders(tx, storeCode);
    const row = await editable(tx, storeCode, id);
    if (!handover(row) || terminal(row.status)) throw new OrderError('This order is not awaiting handover.', 409);
    if (row.paymentStatus !== 'paid') throw new OrderError('Record payment received before completing the order.', 409);
    const otp = await tx.orderOtp.findFirst({ where: { storeCode, orderId: id, status: 'active', purpose: row.orderType === 'pickup' ? 'pickup_handover' : 'delivery_handover' } });
    if (!otp || !otp.lastSentAt) throw new OrderError('Send a new OTP to the customer first.', 409);
    if (otp.expiresAt.getTime() <= Date.now()) {
      await tx.orderOtp.update({ where: { id: otp.id }, data: { status: 'expired' } });
      return { error: 'This OTP has expired. Send a new code.', status: 400 };
    }
    if (otp.attemptCount >= otp.maxAttempts) {
      await tx.orderOtp.update({ where: { id: otp.id }, data: { status: 'revoked' } });
      return { error: 'Too many incorrect attempts. Send a new OTP.', status: 429 };
    }
    const expected = Buffer.from(otp.otpHash, 'hex'), actual = Buffer.from(otpDigest(secret, storeCode, id, otp.id, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const attempts = otp.attemptCount + 1;
      await tx.orderOtp.update({ where: { id: otp.id }, data: { attemptCount: attempts, status: attempts >= otp.maxAttempts ? 'revoked' : 'active' } });
      return { error: attempts >= otp.maxAttempts ? 'Too many incorrect attempts. Send a new OTP.' : 'Incorrect OTP. Check the code and try again.', status: attempts >= otp.maxAttempts ? 429 : 400 };
    }
    await tx.orderOtp.update({ where: { id: otp.id }, data: { status: 'verified', verifiedAt: new Date(), verifiedByAdminId: adminId } });
    await tx.order.update({ where: { id }, data: { status: 'completed', completedAt: new Date() } });
    await tx.orderStatusHistory.create({ data: { storeCode, orderId: id, fromStatus: row.status, toStatus: 'completed', actorType: 'admin', actorAdminId: adminId, reason: 'Email OTP handover verified.' } });
    return { order: await getOrder(tx, storeCode, id, undefined, true) };
  });
  if ('error' in result) throw new OrderError(result.error!, result.status);
  return result.order;
}
