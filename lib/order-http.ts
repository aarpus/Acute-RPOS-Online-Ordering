import { createPrismaClient } from './prisma';
import { getStorefront } from './storefront';
import { authenticatedCustomer } from './customer-session';
import { getAuthenticatedAdmin } from './admin-auth';
import { getAuthConfig, sameOrigin } from './auth';
import { limitedJson, BrandingError } from './branding-validation';
import { MenuError } from './menu-validation';
import { createOrder, getOrder, listOrders, changeOrder, sendConfirmation, sendOrderOtp, verifyOrderOtp, OrderError } from './order-service';
import { sendOrderMail } from './order-mail';
import { adminOrderStores } from './order-admin-scope';

export function orderJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function orderRequest(request: Request, kind: 'customer' | 'admin', id?: string) {
  let db: ReturnType<typeof createPrismaClient> | undefined;
  try {
    if (request.method !== 'GET' && !sameOrigin(request)) throw new OrderError('Invalid origin.', 403);
    const url = new URL(request.url);
    const admin = kind === 'admin' ? await getAuthenticatedAdmin(request) : null;
    if (kind === 'admin' && !admin) throw new OrderError('Authentication required.', 401);
    const storefront = kind === 'customer' ? await getStorefront(request) : null;
    let storeCode = storefront?.store.code || '';
    const user = storefront ? await authenticatedCustomer(request, storeCode) : null;
    if (kind === 'customer' && !user) throw new OrderError('Please log in to view or place orders.', 401);
    db = createPrismaClient();
    const queryStore = url.searchParams.get('store_code'), headerStore = request.headers.get('x-store-code');
    if (admin && queryStore && headerStore && queryStore !== headerStore) throw new OrderError('Conflicting store selection.', 403);
    const access = admin ? await adminOrderStores(db, admin, queryStore || headerStore) : null;
    const scope = access?.codes ?? storeCode;
    if (request.method === 'GET') {
      if (id) return orderJson(await getOrder(db, scope, id, user?.id, !!admin));
      const page = Number(url.searchParams.get('page') || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new OrderError('Invalid page.');
      return orderJson({ ...await listOrders(db, scope, { userId: user?.id, page, query: url.searchParams.get('q') || '', status: url.searchParams.get('status') || '', payment: url.searchParams.get('payment') || '', mode: url.searchParams.get('mode') || '', admin: !!admin }), ...(access ? { stores: access.stores } : {}) });
    }
    const body = await limitedJson(request) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new OrderError('Invalid request.');
    if (!id && !admin && request.method === 'POST') {
      const result = await createOrder(db, storefront!, user!, body);
      let warning: string | undefined;
      try { await sendConfirmation(db, storeCode, result.order.id, sendOrderMail); }
      catch { warning = 'Order saved. Confirmation email could not be sent yet; you can retry from your order.'; }
      const order = await getOrder(db, storeCode, result.order.id, user!.id);
      return orderJson({ ...order, ...(warning ? { warning } : {}) }, result.created ? 201 : 200);
    }
    if (!id) throw new OrderError('Invalid action.');
    const authorizedOrder = await getOrder(db, scope, id, user?.id, !!admin);
    storeCode = authorizedOrder.storeCode;
    if (body.action === 'confirmation') {
      try { await sendConfirmation(db, storeCode, id, sendOrderMail, true); }
      catch (error) { if (error instanceof OrderError) throw error; throw new OrderError('Order saved, but email could not be sent. Retry after one minute.', 502); }
      return orderJson({ order: await getOrder(db, storeCode, id, user?.id, !!admin), message: 'Confirmation email sent.' });
    }
    if (!admin) throw new OrderError('Admin access required.', 403);
    if (body.action === 'send_otp') {
      await sendOrderOtp(db, storeCode, id, getAuthConfig().secret, sendOrderMail);
      return orderJson({ order: await getOrder(db, storeCode, id, undefined, true), message: 'OTP sent to the customer email.' });
    }
    if (body.action === 'verify_otp') {
      const order = await verifyOrderOtp(db, storeCode, id, admin.id, getAuthConfig().secret, body.code);
      return orderJson({ order, message: 'OTP verified. Order completed.' });
    }
    const order = await changeOrder(db, storeCode, id, admin.id, String(body.action || ''), body);
    let warning: string | undefined;
    if (body.action === 'status' && (order.mode === 'Pickup' && order.status === 'ready' || order.mode === 'Delivery' && order.status === 'out_for_delivery')) {
      try { await sendOrderOtp(db, storeCode, id, getAuthConfig().secret, sendOrderMail); }
      catch { warning = 'Status saved. OTP email could not be sent; retry after one minute.'; }
    }
    return orderJson({ order: await getOrder(db, storeCode, id, undefined, true), ...(warning ? { warning } : {}) });
  } catch (error) {
    if (error instanceof OrderError) return orderJson({ error: error.message, ...error.details }, error.status);
    if (error instanceof SyntaxError) return orderJson({ error: 'Invalid request body.' }, 400);
    if (error instanceof BrandingError || error instanceof MenuError) return orderJson({ error: error.message }, error.status);
    console.error('Order request failed', { method: request.method, orderId: id, error });
    return orderJson({ error: 'Unable to process the order. Please try again.' }, 500);
  } finally { if (db) await db.$disconnect(); }
}
