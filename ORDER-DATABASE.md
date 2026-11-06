# Order database

Migrations: `20261103120000_create_order_tables`,
`20261103140000_enable_order_checkout`, and
`20261103160000_fix_order_admin_scope`.

The last migration is required for admin order actions. Admin accounts are
company-scoped, so their `store_code` can differ from an order's store code.
The migration updates payment, history and OTP admin foreign keys accordingly.
Apply pending migrations with `npm run db:migrate:deploy` before using the
admin order actions.

Checkout now persists orders, reserves tracked inventory and provides customer
history/tracking plus admin cash collection, status changes and email OTP handover.
The existing screen layouts and styling are retained. POS mode/setup, integration
blocking and external POS order APIs remain a later phase.

| SQL table | Prisma model | Purpose |
| --- | --- | --- |
| orders | Order | Customer/address snapshots, schedule, totals and current status |
| order_items | OrderItem | Item name, quantity and price snapshots |
| order_item_options | OrderItemOption | Variant, modifier and combo snapshots |
| order_transaction | OrderTransaction | Cash-on-delivery/pay-at-pickup records |
| order_status_history | OrderStatusHistory | Customer, admin and system events |
| order_otps | OrderOtp | Email handover OTP hashes and verification history |

## Relations and snapshots

All foreign keys include `store_code` and restrict parent deletion and key updates.
User and Admin have additional `(storeCode, id)` unique keys. Store codes remain
tenant keys; there is no foreign key to the legacy Store table.

History uses `actor_user_id` or `actor_admin_id` rather than a polymorphic
`actor_id`, so both roles have real foreign keys. A check constraint requires
exactly the matching actor key, or neither for system events.

An option's `source_option_id` is an informational polymorphic catalog reference,
not a foreign key. Checkout resolves its type and store from the validated
catalog before writing the immutable option name/price snapshot.

`base_unit_price` includes the selected size/variant price. Variant option rows
must not charge that price again. Option quantity is per parent item; combo
quantities can be fractional. Money uses `DECIMAL(12,2)`, not floating point.
Option additional prices are the complete surcharge for one selected option
per parent item (including the component quantity); do not multiply them by the
option quantity again. Fixed combo prices are already included in the base unit
price, so their snapshot option surcharge is zero. The original selection key
is stored separately from the catalog UUID for safe modifier/combo reordering.

Checkout recalculates current prices server-side and compares the quote before
saving. This phase keeps the existing subtotal/delivery fee calculation; tax and
discount remain zero. Online card/wallet payments and coupon redemption are not
enabled.

Delivery requires an address JSON object. Scheduled orders require
`scheduled_at`; ASAP orders leave it null. Orders require a customer email.
Currency must be supplied from the store's configuration.

## Checkout, inventory and email

- Orders, snapshots, pending cash transaction, initial history and inventory
  allocation are committed together. Same-store order writes use a transaction
  advisory lock; inventory rows are also locked before decrementing.
- A stable checkout idempotency key and normalized request fingerprint return
  the existing order on an identical retry. A changed request with the same key
  is rejected. Retries do not depend on the current menu or stock.
- Item snapshots preserve image, SKU, selected options and stock allocations;
  store name/address/timezone are also snapshotted. Historical receipts do not
  depend on mutable catalog/customer addresses.
- Tracked stock, including linked modifiers and fixed/selectable combo
  components, is allocated using decimal quantities. Backorders are decremented
  when enabled. Cancelling an unpaid incomplete order restores allocations once.
- Confirmation mail is sent after commit. Failure leaves the order intact.
  Confirmation attempts are limited to once per minute per order and can be
  retried by the owning customer or store admin. SMTP uses existing settings.
  No persistent mail queue or delivery guarantee is introduced.
- Cash collection updates the transaction and payment status atomically.
  Paid orders cannot be cancelled here; refunds are not part of this phase.

## OTP lifecycle

- Generate a code securely and store only its hash; send the code to
  `recipient_email`. The schema contains no plaintext code or recipient phone.
- Codes contain 6 digits and expire after 10 minutes. Wrong-attempt limit is 5,
  and resend attempts require a 60-second cooldown, including failed sends.
- One active row per store/order/purpose is enforced by a partial unique index.
  Expiry alone does not release the index: revoke/expire the old row before
  issuing a replacement, in a transaction.
- Update send counters/timestamps only as appropriate to actual email delivery.
  Never expose hashes in customer or staff responses.
- Verification checks expiry, remaining attempts, order type/status
  and payment; compare the hash and atomically consume the OTP, complete the
  order and append history. Use a transaction/row lock to prevent concurrent use.
- Verified rows require `verified_at` and `verified_by_admin_id`. Nonverified
  rows leave both null. Exhausted codes must be revoked.

Pickup follows placed → accepted → preparing → ready → completed. Delivery adds
out_for_delivery between ready and completed. Entry into pickup ready or delivery
out_for_delivery triggers OTP mail. Completion can only happen through successful
OTP verification after cash collection; direct completion transitions are rejected.
Failed OTP email revokes the undelivered code and leaves order status saved.

## Website handlers and access

| Route | Methods | Access |
| --- | --- | --- |
| /api/orders | GET, POST | Customer list/create, scoped to authenticated user and selected store |
| /api/orders/:id | GET, POST | Owning customer detail/confirmation resend |
| /api/admin/orders | GET | Signed-in admin's own store |
| /api/admin/orders/:id | GET, POST | Same-store admin detail/actions |

Admin action names: `status`, `payment`, `confirmation`, `send_otp`,
`verify_otp`. Status changes pass `status`, cancellation additionally requires
`reason`, OTP verification passes `code`.

Creation passes the existing cart/contact/schedule/quote plus
`idempotencyKey`. Email and user identity come from the authenticated account,
not the request body. Every write checks same-origin. Responses are no-store,
serialize money/timestamps explicitly and never expose OTP hashes.
History actor details and private inventory allocations are not returned.

List results contain `orders`, `page`, `pageSize` (20) and `total`; query
filters are `q`, `status`, `payment`, `mode` and `page`.
Successful create returns the saved order (201 new, 200 replay).
An action returns `order` with optional `message`/`warning`.
Email failure after status/create preserves success plus a warning.
Authentication/ownership errors use 401/403/404; invalid transitions, changed
quotes and reused checkout keys use 409; resend cooldown uses 429.

Customer confirmation/tracking URLs include the order ID and store code so they
survive refresh. My Orders reads saved records after login, and tracking refreshes
every 15 seconds while visible. Old session-only demo history is not imported.

## Commands

- `npm run db:generate`: regenerate Prisma Client.
- `npm run test:orders:schema`: isolated PostgreSQL migration/constraint tests.
  Requires PostgreSQL binaries (Windows default: PostgreSQL 18); override with
  `PG_BIN`. The test does not read `.env` or `DATABASE_URL`.
- `npm run test:orders`: real order handlers/auth and concurrency tests against a
  disposable PostgreSQL cluster, with all SMTP calls mocked (no real email).
- `npm run db:migrate:deploy`: apply pending migrations to the configured database.

SQL-only CHECK constraints and the active-OTP partial index must be preserved
when generating future migrations. UUID defaults and updated timestamps are
managed by Prisma; raw SQL callers must supply IDs and required updated times.
