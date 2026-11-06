# Menu management database

Runtime CRUD, archive/SEO migration and customer menu integration are now implemented.
See [MENU-DATABASE.md](../MENU-DATABASE.md) for current usage and verification.
The schema-only notes below describe the original migration.

Prepared migration: `20261030120000_add_menu_management_tables/migration.sql`.
This change prepares models and SQL only. It does not apply a migration to the
configured database, add a sync/discount engine, or change existing APIs or UI.

| Prisma model | PostgreSQL table |
| --- | --- |
| MenuSyncLog | menu_sync_logs |
| MenuCategory | menu_categories |
| MenuItem | menu_items |
| MenuItemCategory | menu_item_categories |
| MenuItemVariant | menu_item_variants |
| MenuModifierGroup | menu_modifier_groups |
| MenuModifierOption | menu_modifier_options |
| MenuItemModifierGroup | menu_item_modifier_groups |
| MenuComboGroup | menu_combo_groups |
| MenuComboOption | menu_combo_options |
| MenuTaxRule | menu_tax_rules |
| MenuItemInventory | menu_item_inventory |
| MenuItemSchedule | menu_item_schedules |
| MenuOffer | menu_offers |
| MenuOfferUsage | menu_offer_usage |
| MenuItemPrice | menu_item_prices |
| MenuItemImage | menu_item_images |
| MenuSyncSetting | menu_sync_settings |

## Existing project and migration strategy

Inspected all ten existing SQL migrations, the Prisma schema, `lib/prisma.ts`,
auth/session code, and both supplied JSON reference files. Prisma is 6.19.3 with
the PostgreSQL driver adapter and Cloudflare worker/process environment fallback.
Existing models are User, Admin, Store, WebsiteBranding, HeroBanner,
WebsiteCategory, PosSyncLog and PosApiCredential. Sessions use signed cookies;
there is no Session model. All eight existing model definitions are preserved.
Existing website categories and POS logs serve the current branding API; new
menu categories and sync logs are separate menu-domain tables as requested.

The migration was generated offline with `prisma migrate diff` from a saved copy
of the original schema to the expanded schema. Only menu tables are created or
altered. The custom SQL section adds partial/expression indexes and CHECKs that
Prisma 6 cannot represent. Preserve them in future migrations. The SQL has an
explicit transaction for atomic application.

The old history assumes `public.tbl_store` already exists: its first store
migration alters that external legacy table instead of creating it. Replaying
the entire migration history against a completely empty database/shadow database
will therefore fail. Restore or correctly baseline the legacy store schema
before replaying the old history. This new migration does not change that history.

## Reference decisions and corrections

The columns/examples document is a proposed schema, not executable SQL. All
reference columns and SQL types are retained, with these explicit decisions:

1. Only `store_code` has explicit requiredness in the reference. IDs, parent keys,
   names, operational flags, and core values are required; descriptions, images on
   items/categories, external identifiers, audit actors, optional bounds, times,
   and all JSONB fields can be null. Manual records need no POS identifiers. UUIDs
   use Prisma `uuid()`. The item-category junction has its reference composite
   key, rather than an invented surrogate ID.
2. Defaults express manual entry: `source_type=manual`, `sync_enabled=false`,
   POS sync disabled, auto-publish disabled, manual protection enabled, and current
   catalog version zero. Example values such as `pos`, catalog version 101,
   promotional amounts, prices, timezone and currency are sample data, not defaults.
3. Added `source_type` to variants, modifier options, combo groups/options, tax
   rules, prices and images to distinguish manual child records during a POS sync.
   Item-category/modifier links, inventory and schedules inherit ownership from
   the item (and linked group/category); a sync must preserve manual-owned data.
4. Added `allow_option_quantity` to modifier groups: the payload requires it but
   the column document omits it. Option quantity limits already exist.
5. Added combo-group `selection_type` (`fixed` or `selectable`). For Pizza + Fries
   + Drink with no customer choice, create one fixed required group with
   `min_select=max_select=3`, and three default options with quantity 1. Alternatively
   use one fixed group per component. Fixed groups are included automatically;
   selectable groups use their selection bounds. Cross-row validation of group
   type, count, defaults and the parent item's `combo` type belongs to the future
   catalog writer. External-only components are allowed until their menu item
   exists; resolved components use the store-safe item FK.
6. The payload's `special_instruction_max_length` maps to the reference column
   `special_instructions_max_length`; `nutrition` maps to `nutrition_info`;
   `custom_fields` and channel availability can be retained in item `metadata`.
   Image `url`/`alt` map to `image_url`/`alt_text`. Group `name` maps to combo
   `group_name`, and combo-choice `price_delta` maps to `extra_price`.
7. Offer payload `name`, `coupon_code`, `min_order_amount`, `limits` and `stacking`
   map to `offer_name`, `offer_code`, `minimum_order`, usage/per-customer limits,
   and `is_stackable`/priority. `auto_apply` is represented in `conditions` (it
   must not be assumed to be the inverse of `coupon_required`). Targets map to
   applicable items/categories; variant targets, customer segments, eligibility,
   first-order/minimum-cart rules, stacking exclusions and complex buy/get rewards
   use `conditions`/`rewards`. Happy Hour/timezone/recurrence rules also live there.
   Percentage offers require a numeric value in [0,100]; other money values use
   NUMERIC(12,2), tax percentages NUMERIC(7,4), and stock/component quantities keep
   the reference precision. No calculation/redemption engine is implemented.
8. Payload `fees` and `price_lists` have no corresponding requested tables. No
   extra tables were added. Resolve a price-list's channel/currency/priority into
   `menu_item_prices`. If raw catalog envelope retention is needed, it can be
   explicitly designed later; there is no dedicated fee persistence in these 18
   tables. Do not silently treat a fee as an item price or tax.
9. `inventory_quantity` on variants is retained for compatibility, but
   `menu_item_inventory` is the stock authority. Writers must keep that legacy
   field null or update it in the same transaction; never sum both. Item stock
   and variant stock are separate scopes, not automatically additive.
10. Reference timestamps claiming to be entirely DB-managed were imprecise:
    `created_at` defaults in PostgreSQL, while `@updatedAt` and UUID generation
    are managed by Prisma. Direct SQL writers must provide IDs and `updated_at`
    and advance it on updates. There are no update-timestamp triggers.
11. `created_by`, `updated_by`, usage `customer_id` and `order_id` remain logical
    UUID references. There is no order model; adding a store-safe User/Admin FK
    would require altering their existing unique keys. To preserve those models,
    future writers must verify actor/customer ownership with `store_code` and
    keep order/customer snapshots for history. These fields intentionally are not
    declared Prisma relations. JSONB targets likewise require store-scoped lookup.

## Isolation, history and synchronization contracts

Every table requires a nonblank `store_code VARCHAR(50)` with no Store FK. Every
declared FK includes `store_code`. Variant links also include `menu_item_id`, so
a variant from another item cannot be attached accidentally. External IDs are
unique per store and nullable for manual records. All FK updates/deletes use
RESTRICT; use availability/active flags and archive rather than deleting history.
There is no existing order table to which new product FKs can be added.

Store-scoped foreign keys prevent cross-store links, not unauthorized reads.
Future callers must derive the store from authenticated context, filter every
query by it, and resolve all external IDs within it; these tables do not enable
PostgreSQL row-level security.

`menu_sync_settings` has one row per store and enforces manual protection as true.
Future sync must lock that settings row, validate request IDs/catalog versions,
log full/delta requests, resolve identifiers within the authenticated store, and
mutate only POS-owned records. Missing POS rows on full sync should be deactivated,
never deleted; manual parents and manual children survive. `sync_config` can hold
`missing_pos_records_on_full_sync=deactivate`, `preserve_admin_overrides=true`,
and override policies. `allow_manual_override`/`conflict_resolution` apply to
POS-owned records, not manual records. The schema stores and constrains policy;
enforcement of actual sync mutations requires the future sync implementation.

Required modifier selection is expressed with positive `min_select`; per-item
overrides and JSONB conditions support optional/variant-specific behavior.
Writers must validate effective overrides against group selection type and the
number/quantity of available options. Conditional JSONB is data, not executed SQL.

Offers support percentage, fixed, bogo, buy_x_get_y, combo_discount,
category_discount, product_discount, variant_discount, coupon, first_order,
minimum_cart, free_delivery, happy_hour, scheduled, customer_specific. Rule types
can be combined in JSONB. Redemption limits require atomic counters/locking over
usage records (reserved/redeemed/reversed/cancelled) in a future order transaction.
The current schema does not enforce aggregate usage limits or idempotent order
redemption; order identity and stacking semantics must be defined by that writer.

## Price, image, inventory and schedule rules

SQL partial indexes enforce one inventory row per item or variant, one modifier
assignment per scope, one default variant, and one active primary image per item.
Price indexes reject identical active windows for the same store, item, optional
variant, type, currency and priority, including unbounded endpoints. Inactive
history remains available. No PostgreSQL extension is required.

Different overlapping windows at the same priority must be rejected by future
price writers under a lock on the item row (including all writers, imports and
reactivation). Treat windows as `[start_at,end_at)`, null as unbounded. Locking
prevents concurrent inserts from both passing the overlap query. Higher priority
wins; prefer variant-specific prices over item-level prices at equal priority.
Keep channel names (`online`, `pickup`, `delivery`, `dine_in`) as `price_type` even
for scheduled channel prices: the timestamps specify scheduling. `scheduled` is
a generic timed override without a channel. `base`/`variant` fallback rows and
item/variant price columns must have one documented authority in the future
reader; do not add prices together. No price reader is implemented here.

Schedules have IANA timezone names supplied by the writer, ISO weekday arrays
(1=Monday through 7=Sunday), SQL DATE bounds and SQL TIME(6) daily windows. Store
timezone is repeated explicitly per schedule, never inferred from server time.
Multiple rows permit multiple windows. Both times null mean an all-day window;
end before start means an overnight window starting on the matched weekday.
Equal times mean a full-day window. Date bounds are inclusive in local time.
Validate real IANA zones and exception JSON/application rules before publication.

## Validation and application

Validation completed on 2026-10-30: Prisma format, validation and client generation
passed with 6.19.3; TypeScript passed; the existing storefront regression script
passed. PostgreSQL 18.6 applied the migration successfully in a disposable cluster:
18 tables, 18 required store columns, 19 store-safe foreign keys, eight existing
table sentinels preserved and 24 invalid writes rejected. Fixed combo components,
manual defaults, multiple schedule windows and overnight windows passed. All eight
original model definitions were compared against the saved baseline and are
unchanged; the generated SQL section matches the final Prisma schema diff.

Run local checks from the project root:

```powershell
npx prisma format
npx prisma validate
npx prisma generate
npx tsc --noEmit --incremental false
node scripts/test-menu-schema.mjs
```

The integration script creates an isolated temporary PostgreSQL cluster, applies
the actual migration, checks table/column/FK metadata and rejected invalid writes,
then stops and removes the cluster. It never reads `.env` or `DATABASE_URL`.
It preserves eight existing-table sentinels, not a full production backup. Use
`PG_BIN` to select a local PostgreSQL bin directory if needed. No database server
installation or dependency changes are part of this change.

To apply later, first select the intended **development or staging** database in
`DATABASE_URL` using your normal secret management, confirm backups and review all
pending migrations (deploy applies all pending migrations, not just this one):

```powershell
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
```

`migrate status` may exit nonzero simply because migrations are pending; inspect
its output. Resolve baseline/drift problems before deploying. Rehearse on a copy
of the real legacy database first. Production application is a separate deliberate
deployment step. Do not use `db push`, reset, or edit previously applied migration
files to install this schema.
