# Website branding module

This module extends the existing Vinext/React admin and public storefront. It uses PostgreSQL through the existing Prisma adapter, signed admin sessions, company-scoped store management, and Cloudflare R2 bindings. No dependencies were added or upgraded.

## Configuration

Keep secrets in Cloudflare secrets in production and ignored `.dev.vars` locally. Never use `VITE_` or `NEXT_PUBLIC_` for credentials.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing PostgreSQL connection, used by Prisma. |
| `EMAIL_VERIFICATION_SECRET` | Existing admin/customer session secret, at least 32 characters. |
| `COMPANY_CODE` | Existing trusted company scope for admin store authorization; falls back to the admin's store code. |
| `ADMIN_USER_ID` | Existing numeric store audit identity. |
| `R2_BRANDING_BUCKET` | Production R2 bucket name, set before building/deploying. Optional locally: development automatically uses `online-ordering-branding-local` with on-disk R2 emulation. |

POS tokens are generated in Admin > Stores > Edit > POS API Integration. Copy a newly generated token immediately: it is shown only once. Tokens are stored as SHA-256 hashes of cryptographically random values in PostgreSQL. Regenerate Token invalidates the old token; Disable Token revokes access. No per-store POS credentials are stored in environment configuration.

Local `npm run dev` automatically provides a local R2 binding without a Cloudflare account or bucket configuration. Images persist in `.cloudflare/state/v3/r2` across development-server restarts; retain this folder to retain local uploads. After updating the configuration, restart an already-running dev server. Production uploads require a configured R2 binding. Colors and edits referencing existing permanent images do not. The bucket can remain private: `/api/media/[...key]` serves only names matching this module's generated image-key format. Objects have a SHA-256 store namespace and a UUID filename. Uploaded content is limited to PNG/JPEG/WebP, 2MiB, with server-side MIME/signature checks. Binary content is never stored in PostgreSQL. Admin uploads require the existing session and store authorization. Replacement does not delete old objects because historical banners may reference them. Unreferenced objects from canceled or failed saves can be cleaned up later using a retention policy that checks database references first.

R2 uses the [official Workers binding API](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/), with no S3 SDK or Node filesystem persistence. POS and admin image locations accept HTTP or HTTPS, including localhost, IP addresses and custom ports, or root-relative paths such as /images/banner.jpg. Temporary blob/data URLs, unsafe schemes and embedded credentials are rejected. Remote images are displayed by the browser; the server never fetches them.

## Data model and migration

New models are `WebsiteBranding`, `HeroBanner`, `WebsiteCategory`, and `PosSyncLog`, mapped respectively to `tbl_website_branding`, `tbl_hero_banner`, `tbl_website_category`, and `tbl_pos_sync_log`. All new primary keys are UUIDs. Prisma camelCase fields map to the requested snake_case columns. Audit times use `TIMESTAMPTZ(6)`. Existing User, Admin and Store column definitions are preserved.

The migration contains:

- Branding: `store_code`, `logo_url`, five color columns (including footer text color), created/updated times and nullable UUID audit actors; unique `store_code`.
- Hero: store/external ID, image URL, eyebrow/subtitle/heading, text color, alignment, overlay opacity, status/source/batch, times and UUID audit actors. Composite store/status index plus `uq_hero_banner_active_store WHERE status = 1`.
- Categories: store/external ID, name/image/description, order/visibility/status/source/batch, times and UUID audit actors; composite index on store/status/order. Multiple active categories are supported.
- Logs: store/type/request/batch, received/inserted/deactivated counts, status/error/time; unique store/type/request and an index on store/type/time. PostgreSQL permits multiple NULL request IDs under the unique index.
- Check constraints enforce status/source/alignment/overlay/color and log type/status values.

All hero writes share a transaction-scoped PostgreSQL advisory lock keyed by store and `HERO_BANNER`; category writes use store and `CATEGORY`. Workspace saves coordinate branding and hero in one transaction. Normal hero edits update the active row; admin POST replacements deactivate the previous row and create a new row. POS sync updates a matching external banner ID in place, or inserts a new row for a new ID while deactivating the previous active hero. Categories use explicit removals for admin saves and incremental POS synchronization: matching external IDs update in place, new IDs insert, omitted categories remain unchanged. Existing records are retained as inactive history.

Repeated successful POS request IDs return the previous successful response counts and make no data changes, even after later requests replace the active data. Failed writes roll back before a separate locked failure log is written, where possible. A failed request may be retried. A late failing retry cannot overwrite a success log. Errors never log or return API tokens or database details.

Commands:

```sh
npx prisma format
npx prisma validate
npx prisma migrate dev --name website_branding_hero_categories
npx prisma generate
```

Production deployment:

```sh
npx prisma migrate deploy
npm run build
```

Execution: format, validate and generate succeeded. `migrate dev` failed with P3006/P1014 because the pre-existing `20261029063000_add_store_time` migration references `tbl_store` without an earlier migration creating it in the shadow database. No reset was performed. `migrate deploy` successfully applied `20261029120000_website_branding_hero_categories` to the configured local `online_ordering` database. Development shadow-database bootstrapping still needs a reviewed baseline for the pre-existing store table; this change does not rewrite historical migrations.

## Admin API

All routes require the existing `st_admin_session`. Pass `?store_code=STORE001` to select a store authorized under the existing trusted company scope; if omitted, the admin's store code is used. IDs are always scoped to the authorized store. Mutations reject cross-origin browser requests.

| Route | Methods |
| --- | --- |
| `/api/admin/branding` | GET, PUT |
| `/api/admin/hero-banner` | GET, POST (replace/version) |
| `/api/admin/hero-banner/[id]` | PUT (edit active row) |
| `/api/admin/categories` | GET, POST |
| `/api/admin/categories/[id]` | PUT, DELETE (soft deactivate) |
| `/api/admin/branding/workspace` | GET, PUT (atomic save for the common button) |
| `/api/admin/branding/upload` | POST, raw image bytes with image MIME Content-Type |

Successful JSON responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": "..." }`. Read/write responses include persisted `{ branding, hero, categories }` snapshots. Upload returns `{ success: true, data: { url: "/api/media/..." } }`. Admin input uses camelCase Prisma names. The workspace payload uses `section: "Branding"`, `branding`, `hero`, and the loaded `heroId`, or `section: "Categories"`, `categories`, and explicit `removedIds`. New workspace category IDs start with `new-`; persisted IDs are UUIDs.

The existing Save Changes and Cancel controls, color picker and live preview remain. Cancel restores the last successful snapshot. The store selector uses `/api/admin/stores` and Store management links into the selected store's editor. No initial GET writes default settings. Admin demo localStorage and simulated saving have been removed.

## POS APIs

Send `Authorization: Bearer <store-specific-credential>` and `Content-Type: application/json`. JSON bodies are limited to 256KiB and category batches to 100. All POS routes use `/api/pos/stores/{store_code}/{resource}/sync`; the URL supplies the store code. Do not send `store_code` in the JSON body. A nonempty `request_id` (maximum 100 characters) is required. Shared routes without `/stores/{store_code}` have been removed and must not be added for future APIs. Statuses include 200 success/replay, 400 invalid data, 401 missing/invalid credential, 403 store denial, 409 conflict where applicable, 413 payload too large and 500 internal failure. Rate limiting at the Cloudflare edge can be added operationally; no public unauthenticated write endpoint exists.

### Single hero

`POST /api/pos/stores/{store_code}/hero-banner/sync`

```json
{
  "store_code": "STORE001",
  "request_id": "HERO-10001",
  "banner": {
    "external_banner_id": "B001",
    "image_url": "https://example.com/banner.jpg",
    "eyebrow": "FRESH FOOD",
    "subtitle": "Delicious Food",
    "heading": "Good Food Brings People Together",
    "text_color": "#FFFFFF",
    "alignment": "left",
    "overlay_opacity": 40
  }
}
```

HTTP 200:

```json
{
  "success": true,
  "message": "Hero banner synchronized successfully",
  "store_code": "STORE001",
  "data": { "status": 1, "source": "POS" }
}
```

`banner` must be an object; banner arrays and a `banners` field are rejected. There is exactly one active hero, with no carousel.

### Multiple categories

`POST /api/pos/stores/{store_code}/categories/sync`

```json
{
  "store_code": "STORE001",
  "request_id": "CAT-10001",
  "categories": [
    { "external_category_id": "CAT001", "category_name": "Pizza", "image_url": "https://example.com/pizza.jpg", "description": "Fresh Pizza", "display_order": 1, "is_visible": true },
    { "external_category_id": "CAT002", "category_name": "Burger", "image_url": "https://example.com/burger.jpg", "description": "Fresh Burgers", "display_order": 2, "is_visible": true }
  ]
}
```

HTTP 200:

```json
{
  "success": true,
  "message": "Categories synchronized successfully",
  "store_code": "STORE001",
  "received_count": 2,
  "inserted_count": 2,
  "status": 1
}
```

An empty array is rejected. Every incoming item is validated before writes. Category updates/inserts and the sync log commit together; omitted categories are not modified.

## Public rendering and freshness

`/api/home` defaults to the first active, nondeleted database store by ID. The existing dropdown lists active database stores; `x-store-code` selects only a valid active database store. No environment setting is required for store identity. Customer sessions, ordering, branding and categories are scoped to the validated database store code. The endpoint reads that store's branding, one active hero, and active visible categories ordered by display order and ID. It returns no internal audit records or integration secrets. Default logo/colors/hero remain the existing visual fallback before configuration; category records come from PostgreSQL. A default fallback image is not an inactive historical database record. Public category IDs use stable database UUIDs. A separate menuCategoryId maps a matching external catalog key, or an existing catalog category name, to the current demo products. Unmatched categories show an empty menu. Selecting a category clears search and scrolls to its filtered dishes; See All restores all dishes. Product/catalog persistence remains a separate future integration. Existing demo product data and checkout behavior are otherwise unchanged.

Header/footer structure is retained. Branding supplies CSS variables for primary, header, footer and accent colors; the hero uses all saved image/text/alignment/overlay fields. Responses use `Cache-Control: no-store`; open public tabs refresh on focus and every 30 seconds, preserving cart state.

## Verification

```sh
npx tsc --noEmit
node scripts/test-storefront.mjs
node --env-file=.env scripts/test-branding.mjs
node --env-file=.env scripts/test-branding-http.mjs
npm run build
```

The PostgreSQL suite creates unique temporary stores/admins and removes only its fixtures. It covers database persistence, admin CRUD/history, coordinated rollback, concurrent/idempotent POS requests, invalid/empty payloads, category/store isolation, database-validated public store selection, saved public values, session/password regression, image validation, and the R2 binding contract. The HTTP suite starts a separate local Worker on port 3107 with temporary test bindings and checks actual routes, login and local R2 upload/retrieval. Optional `--browser` keeps the fixture preview open until Enter is pressed, then cleans it up.

Real production R2 and POS credentials must be configured and verified for deployment. Test results and any execution limits are reported in the final handoff; local R2 verification does not verify a production bucket. No production deployment is performed by this implementation task.

## File inventory

Created:

- `lib/branding.ts`, `lib/branding-admin.ts`, `lib/branding-pos.ts`, `lib/branding-validation.ts`, `lib/branding-images.ts`
- `components/admin/branding-client.ts`
- The seven admin route files listed in the Admin API table (including both `[id]` routes)
- `app/api/pos/stores/[store_code]/hero-banner/sync/route.ts`, `app/api/pos/stores/[store_code]/categories/sync/route.ts`, `app/api/media/[...key]/route.ts`
- `prisma/migrations/20261029120000_website_branding_hero_categories/migration.sql`
- `scripts/test-branding.mjs`, `scripts/test-branding-http.mjs`, `BRANDING-MODULE.md`

Modified:

- `prisma/schema.prisma`, `cloudflare.config.ts`, `cloudflare-env.d.ts`, `.env.example`, `.dev.vars.example`
- `lib/storefront.ts`, `app/api/home/route.ts`, `components/StoreProvider.tsx`, `components/HeroBanner.tsx`, `app/globals.css`
- `components/admin/BrandingWorkspace.tsx`, `ImageUpload.tsx`, `StoreBrandingPanel.tsx`, `StoresBrandingScreen.tsx`, `StoresPage.tsx`
- `scripts/test-storefront.mjs`, `package.json`, `README.md`

### Recorded verification results

- TypeScript: passed.
- Prisma format/validate/generate: passed; new migration applied successfully via migrate deploy.
- PostgreSQL module tests: 140 checks passed.
- Existing storefront/authentication/order regression suite: passed with database-backed store selection.
- Worker HTTP integration: passed, including actual admin login, coordinated saves, local R2 bytes round trip, authenticated POS category synchronization and public/page responses.
- Production build: passed; Vinext emitted sourcemap and static route-classification notices.
- Browser visual checks: not completed. Computer Use stopped because it could not determine the Windows browser URL reliably enough to enforce its policy.
- Production R2 bucket and production POS credentials: not available; only local R2 was verified.
- Production R2 bucket and per-store POS credentials require deployment values. Store details and selection come from PostgreSQL.


### Footer text color

Logo & Colors includes `Footer Text Color`, using the existing color picker. It saves as `WebsiteBranding.footerTextColor` / `tbl_website_branding.footer_text_color` (VARCHAR(7), NOT NULL, default `#FFFFFF`, HEX check constraint). Migration `20261029140000_add_footer_text_color` was applied successfully with migrate deploy, preserving existing branding records. Save/Cancel, persisted reload, live preview and public footer text use the value. Admin branding JSON accepts `footerTextColor`; omitted values preserve the existing color for older clients, while new records default to white. Tests cover persistence, public response, invalid-color rejection and older-client preservation.

### Logo size in pixels

Logo & Colors now includes `Logo Width (px)`. Each store saves an integer width (24?400px) as `WebsiteBranding.logoWidth` / `tbl_website_branding.logo_width`. Height stays proportional; header/footer logos shrink to fit available space on small screens. The live preview uses the same width at its preview scale. Save/Cancel and persisted reload include this field. Its default is 56px, matching the existing bundled logo width. Migration `20261029150000_add_logo_width` adds the column and a database range constraint and was applied with migrate deploy. Older API clients that omit `logoWidth` preserve the existing saved size. New records use the default.


### Primary color across public pages

The shared storefront wrapper now maps Tailwind's existing red theme tokens to the saved primary color, with derived light/dark shades. Buttons, links, prices, category selection, radio/checkbox controls, headings, hover, focus rings/outlines and checked backgrounds use it on menu, product dialogs, cart, pickup, checkout/payment, login/register/account, confirmation and tracking pages. The former overrides routing button backgrounds and selected borders to accent color were removed. Header/footer background and footer text retain their own saved settings; admin screens keep their existing palette. No database change is needed.

### Per-store POS URLs and database tokens

Each store has two independent URL paths, for example `/api/pos/stores/demo1002/hero-banner/sync` and `/api/pos/stores/demo1002/categories/sync`. Both require `Authorization: Bearer <store-token>`; the URL alone grants no access. The server resolves the store from the path, checks token ownership and active store status, and rejects a conflicting body store code. Synchronization payload fields and idempotency behavior are unchanged.

`PosApiCredential` maps to `tbl_pos_api_credential`, with UUID id, unique store_code, unique SHA-256 token_hash, is_active, TIMESTAMPTZ created/updated times and nullable UUID audit actors. Migration `20261029170000_add_pos_api_credentials` was applied with migrate deploy. Store/User/Admin table structures were not changed. Only random token hashes are persisted, and secrets are never returned by metadata GET or public store APIs.

Admin endpoint: `/api/admin/stores/[storeid]/pos-credential` supports GET (status and URLs), POST (generate/rotate; returns token once), DELETE (disable). It uses existing signed admin sessions, company-scoped store authorization, unique store-code checks and same-origin mutation validation. In Store Edit > POS API Integration, the manual ON/OFF switch controls whether incoming POS requests are accepted. Turning it ON generates a token that must be copied into the POS configuration; turning it OFF immediately disables the credential. Regenerating a token invalidates the previous one. The former environment credential map has been removed from configuration, local env files, examples and runtime authentication.

### Development Prisma cache refresh

Vite refreshes dependency optimization on startup/config restart so regenerated Prisma models are loaded instead of an older cached client. POS credential routes report a specific 503 if a stale runtime client is detected. Unexpected branding errors are logged server-side for diagnosis while API responses keep internal details private. The running local POS credential metadata endpoint was verified to return HTTP 200 after cache refresh.

### POS insert/update semantics

Both existing sync POST endpoints support insert and update automatically within the authorized store. Send the same `external_banner_id` or `external_category_id` with a new `request_id` to update that row. Send a new external ID to insert. Full item payloads are required, as in the examples; this is not a partial PATCH. Without an external ID, the item is inserted as a new version. An inactive matching hero can be reactivated in place. Existing category status is preserved, including admin deactivation. Earlier historical duplicates are retained inactive; an active match is preferred, otherwise the most recent inactive match is reused.

Hero sync always leaves exactly one active banner. Category sync accepts just the categories to insert/update. Existing categories not sent remain unchanged. Existing category status is preserved; admin-deactivated categories remain inactive even when later updated by POS. New categories start active. Category lifecycle changes are controlled by the Admin Panel. New category syncs report deactivated_count=0; replays retain their original historical counts. No sync operation physically deletes any banner or category. Incoming matches retain their UUID and creation audit data. Responses include received_count, inserted_count, updated_count and deactivated_count; request replay returns the original counts without updating data again. Sync logs store actual insert/deactivation counts, with updated count derived from received minus inserted. Store locks and transactions continue to cover matching, updates/inserts, deactivation and success logging together. No database migration is required for this change.

### Keeping POS identity during admin edits

Admin hero/category updates that omit their external ID now preserve the existing POS identity rather than resetting it to NULL. Explicit empty/null external IDs still clear the identity. This keeps later POS syncs matching the existing row and counting it as updated. Update counts are per request; a successful request_id replay returns that original request's counts. Use a new request_id and the same external ID to apply a new update. Records already missing an external ID are not assigned a guessed POS identity automatically.

### Identifying request replays in Postman

Successful POS responses include `X-POS-Request-Id` (URL-encoded request ID) and `X-POS-Replayed` (`true` for an already processed request, `false` for a fresh sync). The response body still returns the original saved counts on replay. To apply new edits, send a new request_id with the same external IDs. Worker HTTP tests assert inserted_count=0 and updated_count=1 for a matching hero/category update and verify the replay header without mutating data again.

### POS offers API

`POST /api/pos/stores/{store_code}/offers/sync` with the store's Bearer token.
Use [the JSON example](examples/pos-offers.json). Body: required `request_id` and
a nonempty `offers` array. Store code comes from the URL. Records save to
`menu_offers` and appear under Admin → Menu Management → Offers after refresh.
All-order offers need no item dependencies. Upload target items/categories
before offers that reference them. Both regular and combo items are supported.

Every offer requires `external_offer_id` and `offer_name` (maximum 200 characters).
Creation additionally requires `offer_type`; updates may omit it. Supported
types match the existing menu contract: `percentage`, `fixed`, `bogo`,
`buy_x_get_y`, `combo_discount`, `category_discount`, `product_discount`,
`variant_discount`, `coupon`, `first_order`, `minimum_cart`, `free_delivery`,
`happy_hour`, `scheduled`, `customer_specific`. The existing Offers UI has dedicated
display types for percentage, fixed, bogo and free delivery. Other types remain
stored using the existing generic contract; this API does not add new checkout
discount calculations or enforcement for opaque advanced conditions/rewards.

| Field | Behavior |
| --- | --- |
| `description` | Optional text, maximum 10,000 characters |
| `discount_value` | Nullable nonnegative amount; percentage requires 0–100, fixed requires an amount |
| `max_discount`, `minimum_order` | Nullable nonnegative amounts |
| `offer_code` | Nullable coupon code, maximum 100 characters; unique per store, checked ignoring case |
| `coupon_required` | Boolean, default false; true requires a nonempty coupon code |
| `start_at`, `end_at` | Nullable ISO timestamps with timezone, e.g. `2026-11-06T00:00:00+05:30`; end must be strictly later than start |
| `priority` | Nonnegative integer, default 0 |
| `is_stackable` | Boolean, default false |
| `usage_limit`, `per_customer_limit` | Nullable nonnegative integers; existing redemption history is preserved |
| `applicable_channels` | Array from `website`, `app`, `pos`, `delivery`, `pickup`, `dine_in`; new default is `["website"]` |
| `external_item_ids` | External item IDs, resolved to same-store unarchived `menu_items.id` values in `applicable_items` |
| `external_category_ids` | External category IDs, resolved to same-store unarchived `menu_categories.id` values in `applicable_categories` |
| `conditions`, `rewards` | Optional JSON objects; stored for the existing offer consumers |
| `is_active` | Boolean, default true; false hides the offer without deleting it |
| `configuration` | Optional JSON object containing the existing offer presentation/schedule settings |

Amounts allow at most two decimal places, maximum 9,999,999,999.99. Integers allow
0–2,147,483,647. Each JSON object is limited to 30,000 characters. External target
lists must contain unique nonempty strings. No fixed record-count maximum;
the shared 256 KiB body limit applies.

Omitted optional fields and blank non-text strings preserve current values on
update and use defaults on creation. Blank/null `description` and `offer_code`
clear their columns. Explicit null clears nullable amounts, limits, timestamps,
`conditions` and `rewards`. Null or `[]` clears a target list; clearing both targets
makes the offer apply to all orders. Null channels means no channel restriction;
`[]` excludes all channels. The public website requires the website channel if a
channel array is present. Booleans, priority and offer type cannot be null.

`configuration` supports `image` (HTTP/HTTPS/local path), `website`/`app` booleans,
positive integer `buyQty`, `getQty`, `minItems`, `customer` (`All Customers`,
`New Customers`, `Existing Customers`), `days` (weekday numbers 1–7 or Mon–Sun),
paired `startTime`/`endTime` in HH:mm, and a valid IANA `timezone`. Unknown keys
are retained. Supplied configuration replaces the previous object; null clears
user settings. Its `scope` is derived from resolved targets (`Selected Categories`,
`Selected Items`, or `All Items`) so the admin screen reflects the API mapping.
Daily schedules, channel visibility and public-menu offer dates use existing
public-menu behavior. When both target arrays are present, both are stored;
the admin scope label prioritizes categories.

Manual/archived offers cannot be overwritten. Updates preserve the offer UUID
and `menu_offer_usage` history; omitted offers are untouched. Coupon codes of
manual/archived offers remain reserved. Direct coupon-code swaps/reassignment
are rejected; clear the previous code in a separate successful request first.
Batches are atomic. Successful `request_id` retries replay original counts; use
a new request ID for updates. Migration `20261106140000_allow_offer_sync_log`
enables `MENU_OFFER` logs and must be deployed before use.

### POS item images API

`POST /api/pos/stores/{store_code}/images/sync` with the store's Bearer token.
Use [the JSON example](examples/pos-images.json). Body: required `request_id` and
a nonempty `images` array. Store code comes from the URL. Upload regular or combo
items before their images. Records save to `menu_item_images`.

Every record needs `external_item_id` and `external_image_id`. `image_url` is
required when creating an image; omit or send a blank string on update to keep
the current URL. URLs may be HTTP/HTTPS or local paths such as
`/images/category-0.jpg`. Data URLs, protocol-relative URLs, embedded credentials,
and unsafe protocols are rejected. This API stores image references; it does
not upload/download binary files or check whether the referenced file exists.

Supported optional fields: `alt_text` (maximum 250 characters), `display_order`
(integer 0–2,147,483,647; default 0), `is_primary` (default false), `is_active`
(default true), and `configuration` (JSON object up to 30,000 characters).
There is no description column; use `alt_text` for the image's accessible label.

Omitted optional fields preserve existing values on update and use defaults on
creation. Optional blank non-text values are treated as omitted; blank `alt_text`
clears the label. Explicit null clears `alt_text`/`configuration`. Other fields
cannot be null. No fixed record-count maximum; the shared 256 KiB body limit applies.

Only one image per item can be explicitly selected as primary in a batch.
Selecting a new primary automatically demotes the item's other POS images.
Manual/archived primary images are protected and cause a conflict instead of
being changed. Primary images must be active. Setting `is_active: false` clears
the primary flag unless a contradictory `is_primary: true` was explicitly sent,
which is rejected. Deactivation hides a gallery image without deleting its history.
The public menu shows active, unarchived gallery images, primary first, then
display order; if none remain it uses the item's own `image_url` fallback.

Parents must be unarchived POS items with sync enabled in the same store.
Manual/archived image records cannot be overwritten. External image IDs are
unique per store and cannot move between items. Updates preserve UUIDs and
omitted images are untouched. Batches are atomic; successful `request_id` retries
replay original counts. Use a new request ID for updates.
Migration `20261106130000_allow_image_sync_log` enables the `MENU_IMAGE` log type
and must be deployed before use.

### POS combo options API

`POST /api/pos/stores/{store_code}/combo-options/sync` with the store's Bearer token.
Use [the JSON example](examples/pos-combo-options.json). Body: required `request_id`
and a nonempty `combo_options` array. Store code comes from the URL.

Sequence: regular component items → combo items → combo groups → combo options.
The example needs regular item `ITEM-COLA` and group `COMBO-GRP-DRINKS` first.
Records save to `menu_combo_options`; external component IDs resolve to the
same store's `menu_items.id`. Internal UUID fields are server assigned.

Required on every record: `external_group_id`, `external_option_id`, `option_name`.
`external_component_item_id` is required on creation; omit or send a blank string
on update to keep the current component. Components must be unarchived regular
items; nested combos and self references are rejected. The group and parent
combo must be unarchived POS records and the parent must have POS sync enabled.

Supported optional fields:

| Field | Default and behavior |
| --- | --- |
| `quantity` | 1; positive, up to 9,999,999.999 with at most 3 decimal places |
| `extra_price` | 0; nonnegative, up to 9,999,999,999.99 with at most 2 decimal places |
| `is_default` | false; selectable groups' available default count cannot exceed `max_select` |
| `is_available` | true |
| `display_order` | 0; integer from 0 to 2,147,483,647 |
| `configuration` | Optional JSON object, up to 30,000 characters; null clears it |

There is no description column. `extra_price: null` enables the component item's
current price multiplied by quantity, using the existing `configuration.useItemPrice`
behavior. Numeric `extra_price`, including zero, disables item-price mode; it is
the total additional charge for this option. Changing price mode preserves other
configuration keys unless an explicit configuration replacement/clear is sent.
If supplied directly, `configuration.useItemPrice` must be boolean. Explicit
`extra_price` takes precedence over that configuration key.

Optional blank strings and omitted fields preserve existing values on update and
use defaults on creation. Null is only supported for `extra_price` and
`configuration`. Group, option and name identifiers cannot be blank. No fixed
batch record-count maximum; the shared 256 KiB request-body limit applies.

Updates preserve option UUIDs. An external option ID cannot move to another group;
its component can change within the same group. Manual/archived options are
protected and omitted records are untouched. A batch can switch defaults by
clearing the old default and setting the new one together. Minimum option counts
are not enforced during upload, allowing groups to be populated incrementally.
The public menu evaluates complete group availability before showing the combo.
Batches are atomic; successful `request_id` retries replay original counts.
Use a new request ID for updates. Migration
`20261106123000_allow_combo_option_sync_log` enables `MENU_COMBO_OPTION` logs and
must be deployed before use.

### POS combo groups API

`POST /api/pos/stores/{store_code}/combo-groups/sync` with the store's Bearer token.
Use [the JSON example](examples/pos-combo-groups.json). Body: required `request_id`
and a nonempty `combo_groups` array. Store code comes from the URL.

Upload combo items first, then combo groups, then combo options. Groups can be
created before their options, including required groups. This API saves to
`menu_combo_groups`; it does not create component items or options.

Each group requires `external_combo_item_id`, `external_group_id`, and `group_name`.
Supported optional fields: `selection_type` (`fixed` or `selectable`, default
`selectable`), `min_select` (default 0), `max_select` (default 1), `is_required`
(default false), `display_order` (default 0), `rules` and `configuration` (JSON
objects). There is no description column. Integer fields must be nonnegative
and at most 2,147,483,647. Maximum must be at least minimum; required groups need
minimum 1. `fixed` represents included components; `selectable` lets customers
choose options. Options are uploaded separately through the subsequent API.

Optional blank strings and omitted fields preserve existing values on update
and use defaults on creation. Explicit null clears `rules`/`configuration`;
other optional fields cannot be null. JSON objects are limited to 30,000 characters.
No fixed record-count maximum; the shared 256 KiB request-body limit applies.

Parents must be active, unarchived POS combo items with sync enabled in the same
store. Manual or archived groups cannot be overwritten, and an external group
ID cannot move between combos. Updates keep the group UUID and existing options.
Omitted groups are untouched. Batches are atomic. Repeating a successful
`request_id` replays its original counts; use a new ID for updates.
Migration `20261106120000_allow_combo_group_sync_log` enables its
`MENU_COMBO_GROUP` sync log type and must be deployed before use.

### POS modifier links API

`POST /api/pos/stores/{store_code}/modifier-links/sync` writes item/group
assignments to `menu_item_modifier_groups`. The store is required in the URL;
there is no body-based route. Send `Authorization: Bearer <store-token>` and
`Content-Type: application/json`. The store POS Integration panel displays this
URL. Apply `npm run db:migrate:deploy`: migration
`20261105170000_allow_modifier_link_sync_log` permits `MENU_MODIFIER_LINK` logs.

Important-field example: `examples/pos-modifier-links.json`.
Upload Categories, Items/Combo Items, Modifier Groups and Modifier Options first.
Upload a Variant first only when making a variant-specific assignment.
The body requires a nonblank `request_id` (at most 100 characters) and a nonempty
`modifier_links` array. There is no fixed record-count maximum; the shared
256KiB request limit applies.

| Record field | Behavior |
| --- | --- |
| `external_item_id` | Required nonblank string, at most 100 characters; regular/combo parent item |
| `external_group_id` | Required nonblank string, at most 100 characters; Modifier Group |
| `external_variant_id` | Optional; blank, omitted or null targets the whole item; a supplied ID must belong to that item |
| `is_required_override` | Optional boolean or null; null inherits the group's minimum selection behavior |
| `min_select_override` | Optional nonnegative integer or null; null inherits the effective minimum |
| `max_select_override` | Optional nonnegative integer or null; null inherits the group maximum |
| `display_order` | Optional nonnegative integer, defaults to 0 |
| `allowed_external_option_ids` | Optional array of option external IDs from this group; null allows all; an empty array allows none |
| `conditions` | Optional JSON object or null; internal option UUIDs must not be supplied here |
| `configuration` | Optional JSON object or null; ownership marker is server managed |

All references resolve only inside the URL's store. Parent items and groups
must be POS-owned and unarchived; item POS sync must be enabled. Variants must
be unarchived and belong to the parent. Explicit allowed option IDs must be
unarchived and belong to the chosen group. Missing or wrong-scope dependencies
return 409. Reference records can be staged inactive/hidden; storefront
availability still depends on their final visibility, schedules and stock.

The active mapping identity is `(store_code, item, group, variant-or-null)`.
Sending the same identity with a new request ID updates the existing UUID.
Different groups or variant scopes create separate assignments. The optional
variant field is part of the identity: omitting it targets the whole-item
mapping, not a previously supplied variant mapping. No separate external link
ID is required. An existing manual mapping at that identity returns 409.
Archived mappings stay archived; a new active mapping may be inserted into the
same scope without modifying history. Omitted mappings are unchanged; this sync
does not unlink or physically delete records.

Updates preserve omitted overrides, display order, filters and JSON values.
Blank optional non-text strings behave as omitted, except the variant field
which always determines the scope described above. Null overrides revert to
group defaults. For a new link, unspecified overrides default to null. Effective
minimum/maximum must agree; single-selection groups require maximum 1. An
explicit required=true must have minimum at least 1, and required=false must
have minimum 0. If the filtered available options cannot satisfy the minimum,
return 409. Available default options cannot exceed the effective maximum.
An optional group may be linked without any available choices. Integer values
cannot exceed 2,147,483,647.

Allowed external option IDs are resolved to `conditions.allowedOptionIds` UUIDs
used by the storefront. Omitted filters preserve existing selection; null
removes the filter and [] selects none. Providing `conditions` replaces the
previous object (null clears it), including any previous filter, unless the
top-level allowed list is also supplied. Raw `conditions.allowedOptionIds` is
rejected: use `allowed_external_option_ids`. Each client JSON object is limited
to 30,000 serialized characters. Configuration replacement/null clears user
settings but always retains server-set `_posManaged=true`. This marker allows
the existing table to distinguish POS assignments from manual assignments;
manual CRUD/archive cannot overwrite POS-managed links.

Responses use the standard count format with
`message="Modifier links synchronized successfully"`, `success=true`,
`store_code`, `received_count`, `inserted_count`, `updated_count`,
`deactivated_count=0` and `status=1`. Successful request replays return the
original counts without new writes and set `X-POS-Replayed: true`. Use a new
request ID for new changes. Failed requests may be corrected and retried.
Invalid input/contradictory overrides return 400, invalid/disabled tokens 401,
unauthorized/inactive/ambiguous stores 403, and ownership/reference/option-limit
conflicts 409. Assignments, parent timestamps and success log are atomic.

Run `npm run test:pos:modifier-links` for PostgreSQL route/authentication tests.
Coverage includes the full preceding API sequence, regular/combo and variant
scopes, allowed options, inheritance, required/default limits, manual protection,
archived history, 101 mappings, store isolation, rollback and concurrent replays.

### POS modifier options API

`POST /api/pos/stores/{store_code}/modifier-options/sync` writes to
`menu_modifier_options`. The store code is required in the URL, with no
body-based alternative route. Send `Authorization: Bearer <store-token>` and
`Content-Type: application/json`. The POS Integration panel displays this URL.
Apply `npm run db:migrate:deploy`: migration
`20261105160000_allow_modifier_option_sync_log` permits `MENU_MODIFIER_OPTION` logs.

One example containing the important fields: `examples/pos-modifier-options.json`.
Upload its Modifier Group first. An item is needed only if linking the option
to that item's availability/stock. Item/group assignment to sell these options
on a main item belongs to the subsequent Modifier Links API.

The body requires a nonblank `request_id` (at most 100 characters) and a
nonempty `modifier_options` array. There is no fixed record-count maximum;
the shared 256KiB JSON request-body limit applies.

| Record field | Behavior |
| --- | --- |
| `external_group_id` | Required, nonblank, at most 100 characters; existing POS Modifier Group in the URL's store |
| `external_option_id` | Required, nonblank, at most 100 characters; unique within the store |
| `name` | Required, nonblank, at most 150 characters |
| `price` | Required on create; additional option price, nonnegative number with at most 2 decimal places |
| `is_default` | Optional boolean, defaults to false |
| `is_available` | Optional boolean, defaults to true |
| `min_quantity` | Optional nonnegative integer, defaults to 0 |
| `max_quantity` | Optional integer at least `min_quantity`, defaults to 1 |
| `display_order` | Optional nonnegative integer, defaults to 0 |
| `linked_external_item_id` | Optional external Item ID; blank/omitted preserves existing link, null removes it |
| `configuration` | Optional JSON object; image belongs in `configuration.image` |
| `metadata` | Optional JSON object for additional POS data |

Prices may not exceed 9,999,999,999.99. Integers may not exceed 2,147,483,647.
Each JSON object is limited to 30,000 serialized characters. Image URLs must
use HTTP/HTTPS or a safe local path; blank image strings are valid. There is no
dedicated option description column; the group description is managed by the
Modifier Groups API. Quantity controls are governed by the group's
`allow_option_quantity` setting. The option's own `price` is used even if a
linked item has a different base price.

Updates preserve omitted optional values. Blank optional non-text values are
treated as omitted; a new option still requires a numeric price. Explicit false
and zero are real values. Null clears JSON and the linked item. Provided JSON
objects replace the old object rather than deep-merging it. Quantity bounds
are validated against the resulting existing/new values together.

Matching uses `(store_code, external_option_id)`. New options get `source_type=pos`.
Existing POS-owned, unarchived options update with stable UUIDs, preserving
item-group assignments that refer to the option. External option IDs cannot be
moved to a different group. Missing, archived or manual parent groups return
409. Manual or archived matching options also return 409.

`linked_external_item_id` resolves to `linked_item_id` only within the URL's
store and only for unarchived items. Regular and combo items may be referenced;
the referenced item is not modified. A missing/archived/foreign-store linked
item returns 409 and rolls back the batch. Sending internal `linked_item_id`
directly returns 400; use the external field instead. In the example the linked
ID is blank, so no Item needs to exist. To use stock-linked Extra Cheese, first
upload an item such as `ITEM-CHEESE`, then set
`linked_external_item_id="ITEM-CHEESE"` with a new request ID. Sending null later
removes the link. Public availability/stock behavior follows the linked item.

The final number of available default options in each group may not exceed its
`max_select`. Existing manual options are included in this count and are never
changed. For a single-selection group, switch defaults explicitly by sending
the old option with `is_default=false` and the new one with `is_default=true`
in one batch; defaults are not silently changed on omitted options. Invalid
default counts return 409. Options may be staged without satisfying the group's
minimum selection count; the later required item-group mapping validates that
enough options exist.

Omitted options are unchanged. Send `is_available=false` to disable an incoming
option. Responses follow the count format with
`message="Modifier options synchronized successfully"`, `success=true`,
`store_code`, `received_count`, `inserted_count`, `updated_count`,
`deactivated_count=0` and `status=1`. Successful request replays return the
original counts without writes and set `X-POS-Replayed: true`; use a new request
ID for new changes. A corrected failed request may use the original request ID.
Invalid payloads return 400, invalid/disabled tokens 401, unauthorized/inactive
stores 403 and reference/ownership/default conflicts 409. All option writes,
parent timestamps and the success log commit or roll back together. UUIDs,
archive state, source ownership and audit timestamps are server managed.

Run `npm run test:pos:modifier-options` for PostgreSQL route/authentication tests
with unique temporary fixtures. Coverage includes the group/item API sequence,
standalone and stock-linked options, defaults, quantity bounds, optional blanks,
linked-record preservation, 101 options, manual/archive protection, foreign
stores, concurrent replays and transaction rollback.

### POS variants API

`POST /api/pos/stores/{store_code}/variants/sync` writes to `menu_item_variants`.
The store code comes only from the URL. Use `Authorization: Bearer <store-token>`
and `Content-Type: application/json`. The store's POS Integration panel displays
the URL. Apply `npm run db:migrate:deploy` before use: migration
`20261105150000_allow_variant_sync_log` permits `MENU_VARIANT` logs.

One example with the important fields: `examples/pos-variants.json`. Upload the
regular item or combo master first. The request requires a nonblank `request_id`
(at most 100 characters) and a nonempty `variants` array. There is no fixed count
maximum; the shared 256KiB request-body limit applies.

| Record field | Behavior |
| --- | --- |
| `external_item_id` | Required, nonblank, at most 100 characters; identifies the parent regular/combo item in this store |
| `external_variant_id` | Required, nonblank, at most 100 characters; unique within the store |
| `name` | Required, nonblank, at most 150 characters; e.g. Small, Large, Half, Full |
| `sku` | Optional text up to 100 characters; blank/null clears it |
| `price` | Required for new variants; numeric, nonnegative, at most 2 decimal places |
| `compare_price` | Optional; defaults to null; same numeric limits as price; null clears it |
| `is_default` | Optional boolean; defaults to false |
| `is_available` | Optional boolean; defaults to true |
| `display_order` | Optional nonnegative integer up to 2,147,483,647; defaults to 0 |
| `configuration` | Optional JSON object; variant `group` and `image` are stored here |
| `metadata` | Optional JSON object for additional POS data |

Prices may not exceed 9,999,999,999.99. Each JSON object is limited to 30,000
serialized characters. `configuration.group`, when supplied, must be `Size`,
`Portion` or `Serving`; `configuration.image` must be a safe HTTP/HTTPS URL or
local path (blank is allowed). JSON objects are replaced when supplied, not
deep-merged. Null clears JSON. There is no dedicated variant description
column; the item description belongs to the parent Items/Combo Items resource.

Updates preserve omitted optional values. Blank optional non-text values are
treated as omitted, including blank price on an existing variant; a new variant
still needs a numeric price. Explicit false and zero are real values. UUIDs,
parent UUID, ownership and audit timestamps are server managed. Stock is stored
in `menu_item_inventory`; `inventory_quantity` is rejected by this API and its
legacy variant column is not used for inventory.

Matching uses `(store_code, external_variant_id)`. The parent must exist,
must not be archived and must be POS-owned with sync enabled; otherwise return
409. Both regular and combo parents are supported. Existing variants must be
POS-owned and unarchived. They retain UUIDs and linked pricing, inventory and
modifier assignments on update. An external variant ID cannot be moved to a
different item. Names must be unique ignoring case within an item's unarchived
variants. Atomic name swaps within one batch are allowed.

At most one default variant is allowed per item. Sending `is_default=true`
automatically clears a previous POS-owned, unarchived default for that item,
even when that previous variant is omitted from the request. Two explicit true
defaults for one item in the same batch return 400. A manual or archived default
is protected and cannot be displaced by POS (409). A default is not required;
explicit false can leave the item with none. Default changes are included in
the same atomic transaction. Response `updated_count` counts incoming existing
records, not automatic demotions of omitted defaults.

Omitted variants are otherwise unchanged. Send `is_available=false` to disable
an option without archiving it. Responses follow the other POS APIs:
`success=true`, `message="Variants synchronized successfully"`, `store_code`,
`received_count`, `inserted_count`, `updated_count`, `deactivated_count=0` and
`status=1`. Reusing a successful request ID returns the original counts and
`X-POS-Replayed: true`; use a new request ID for new edits. Missing dependencies,
parent/ownership conflicts and duplicate names return 409. Invalid input returns
400, invalid/disabled tokens 401 and unauthorized/inactive/ambiguous stores 403.
Every batch, default change, parent timestamp and success log commits or rolls
back together. Failed requests may be corrected and retried with the same ID.

Run `npm run test:pos:variants` for real PostgreSQL route/authentication tests
using uniquely named temporary fixtures. Coverage includes Items/Combo Items
dependencies, default replacement/protection, name swaps, foreign-store checks,
linked-record preservation, blank/default handling, 101 variants, rollback and
concurrent request replays.

### POS combo items API

`POST /api/pos/stores/{store_code}/combo-items/sync` creates/updates combo masters
in `menu_items` with `item_type=combo`. This is the next upload stage after
regular Items. The store is required in the URL; there is no body-based route.
Use `Authorization: Bearer <store-token>` and `Content-Type: application/json`.
The POS Integration panel shows the URL. Apply `npm run db:migrate:deploy`:
`20261105140000_allow_combo_item_sync_log` permits `MENU_COMBO_ITEM` logs.

Concise example with important fields: `examples/pos-combo-items.json`.
Use a new request ID with the same external item ID for updates. Send
`is_visible=true` and `is_available=true` after the intended groups/options exist.
The body requires `request_id` and a nonempty `combo_items` array. Record fields,
validation and defaults are the same as the regular Items field table below,
except `item_type`, if supplied, must equal `combo`. The server sets it to
`combo` automatically when omitted. Each record requires `external_item_id`
and `item_name`; a new combo additionally requires `base_price` and nonempty
`external_category_ids`. Categories and optional tax external IDs must already
exist, unarchived, in the URL's store. There is no fixed record-count maximum;
the shared 256KiB request limit and 30,000-character per-JSON-field limits apply.

This API creates the combo master before variants, combo groups and options.
It does not require those child records to exist yet. Nested `combo_groups`,
`combo_options`, `groups` or `children` fields on a combo record return 400;
upload the related resources in their own later stages. The examples explicitly
set `is_visible=false` and `is_available=false` during setup, then show how to
enable the master after all intended components are uploaded. Visibility and
availability otherwise use the Items defaults of true. For staged uploads,
send false explicitly so an incomplete master is not exposed for ordering.

Existing POS-owned, unarchived, sync-enabled combos update in place with stable
UUIDs. Omitted optional fields, category/tax links and existing variants, groups,
options, images, pricing, stock and schedules are preserved. Providing category
IDs replaces category mappings; `external_tax_id=null` clears tax. A regular
item with the same external ID returns 409; this endpoint never converts it to
a combo. Conversely, the regular Items endpoint rejects existing combos.
Manual, archived and sync-disabled matches also return 409.

Responses use the existing count format with
`message="Combo items synchronized successfully"`, `received_count`,
`inserted_count`, `updated_count`, `deactivated_count=0`, `store_code`,
`success=true` and `status=1`. Omitted records are unchanged. Store authorization,
validation and batch rollback follow the Items rules. Successful replay returns
original counts with `X-POS-Replayed: true`; use a new `request_id` for new edits.
Regular Items and Combo Items have separate replay scopes even when their
request IDs match. Source ownership, audit timestamps and UUIDs are server managed.

Run `npm run test:pos:combo-items` for real PostgreSQL route/authentication tests.
The same integration suite is also run as `npm run test:pos:items` to check
regular-item regressions. Combo coverage additionally verifies rejection of
nested child payloads and preservation of existing combo groups/options.

### POS items API

`POST /api/pos/stores/{store_code}/items/sync` writes regular items to
`menu_items` and category mappings to `menu_item_categories`. There is no
body-based store route. Send `Authorization: Bearer <store-token>` and
`Content-Type: application/json`. The store POS Integration panel displays this
URL. Apply `npm run db:migrate:deploy`: migration
`20261105130000_allow_item_sync_log` permits `MENU_ITEM` logs.

Examples: `examples/pos-items.json` lists supported fields;
`examples/pos-items.http` contains separate insert, price update, category/tax
mapping and unavailability requests. Categories must be uploaded first. Tax
rules must be uploaded first only when `external_tax_id` is provided. Modifiers,
options and variants are not required to create an item.

The body requires `request_id` (nonblank, at most 100 characters) and a nonempty
`items` array. There is no fixed record-count maximum; the shared 256KiB request
body-size limit applies. Each item requires `external_item_id` (nonblank, at most
100 characters) and `item_name` (nonblank, at most 200 characters).
New items additionally require numeric `base_price` and nonempty
`external_category_ids`. Category values are external POS IDs, not database
UUIDs. IDs are resolved only within the URL's store and must not be archived.
Unknown or archived Category/Tax references return 409 with the external ID.

| Field | New item default / behavior |
| --- | --- |
| `item_type` | `regular`; only regular items are accepted by this endpoint |
| `external_category_ids` | Required for new items; replaces all category links in the supplied order; omitted on update preserves links |
| `external_tax_id` | Optional; resolves the tax UUID; null clears tax; omission preserves existing tax |
| `base_price` | Required for new items; nonnegative number, at most 2 decimal places |
| `compare_price` | null; nonnegative number with at most 2 decimal places, or null |
| `sku` | null; text up to 100 characters |
| `description` | null; text up to 10,000 characters |
| `image_url` | null; safe HTTP/HTTPS URL or local path |
| `food_type` | null; `veg`, `non_veg`, `vegan`, `egg`, or null |
| `is_featured` | false; boolean |
| `is_visible`, `is_available` | true; booleans |
| `display_order` | 0; nonnegative integer |
| `preparation_time` | null; nonnegative integer in minutes, or null |
| `allow_special_instructions` | true; boolean |
| `special_instructions_max_length` | 250; nonnegative integer |
| `minimum_quantity` | 1; positive integer |
| `maximum_quantity` | null; integer at least `minimum_quantity`, or null |
| `nutrition_info`, `metadata`, `configuration` | null; JSON object or null |
| `allergens`, `tags` | null; array of nonblank strings or null |

Money values may not exceed 9,999,999,999.99. Integer fields may not exceed
2,147,483,647. Each JSON field is limited to 30,000 serialized characters.
Updates preserve omitted optional fields. Quantity bounds are checked against
the resulting old/new values together. Null/empty clears optional text/image
fields; explicit null clears nullable prices, quantities, food type and JSON.

Matching uses `(store_code, external_item_id)`. New records get
`item_type=regular`, `source_type=pos`, `sync_enabled=true` and server-managed
`last_synced_at`. Existing POS-owned, unarchived regular items with POS sync
enabled update in place, retaining UUIDs and their variants, images, inventory,
modifier links and other children. Manual, archived, sync-disabled or combo
matches return 409. The items endpoint accepts only `item_type=regular` when
that optional field is supplied. Combo creation and child-resource syncing are
separate operations. Source ownership, UUIDs, audit fields and archive state
cannot be set by this request.

Omitted items are unchanged. Send `is_available=false` and/or `is_visible=false`
to disable ordering/display. `deactivated_count` remains 0 because no omitted
items are bulk-deactivated. Invalid input returns 400, invalid/disabled tokens
401, unauthorized/inactive/ambiguous stores 403 and missing dependencies or
ownership conflicts 409. The entire batch, category links and success log commit
or roll back together. Same successful `request_id` replays original counts
without new writes and sets `X-POS-Replayed: true`; use a new request ID to apply
new changes. Corrected failed requests can be retried with their original ID.

Example response for one inserted item:

```json
{
  "success": true,
  "message": "Items synchronized successfully",
  "store_code": "YOUR_STORE_CODE",
  "received_count": 1,
  "inserted_count": 1,
  "updated_count": 0,
  "deactivated_count": 0,
  "status": 1
}
```

Run `npm run test:pos:items` with `.env` configured for PostgreSQL. It exercises
the real Items route and Category/Tax dependency routes with real bearer-token
authentication, uses unique temporary store fixtures and cleans them up. It
covers partial updates, dependency resolution, category replacement, tax
clearing, preserved variants, 101-item batches, ownership protection, concurrent
replays, validation, store isolation and atomic rollback.

#### Complete fields and unused optional values

New POS examples should show important fields and avoid duplicate files.
The remaining Items and Combo Items JSON examples are:

- `examples/pos-items.json`
- `examples/pos-combo-items.json`

For Items and Combo Items, optional non-text fields accept `""` or whitespace as
omitted: new records use their defaults; updates preserve existing values.
This covers optional numbers, booleans, JSON fields, food type, item type and tax
reference. A blank category list string preserves mappings on update but cannot
satisfy the required category list on a new record. Similarly, blank base price
preserves the price on update but is rejected on a new record. Empty arrays are
still invalid category lists. Blank `sku`, `description` and `image_url` clear
those optional text/image fields. Explicit `null` continues to clear nullable
fields; explicit `false` and `0` are actual values and are never treated as blank.

`external_item_id`, `item_name` and `request_id` must not be blank. New records
must have a real `base_price` and nonempty `external_category_ids`. For staged
uploads, explicitly use `is_visible=false` and `is_available=false`;
setting a boolean to `""` would use its default on create, which is true
for these two fields. These blank semantics apply to the shared Items/Combo
Items handler; the other existing POS endpoints retain their documented types.

#### Where the remaining item details belong

`examples/pos-items.json` contains every supported item input field, including
the optional `item_type`. It is a valid Items API request. JSON subkeys in
`nutrition_info` and `metadata` are illustrative stored data; they do not create
related records or automatically enable new storefront behavior. Item admin
settings `enabled` and `badge` live in `configuration`. Nutrition, allergens and
tags are stored on `menu_items` as JSON.

The item editor combines data from several tables. The following details are
separate resources, not additional fields to put in an Items sync request:

| Detail | Table | Planned POS route after `/api/pos/stores/{store_code}` |
| --- | --- | --- |
| Size/portion variants, variant price (implemented) | `menu_item_variants` | `/variants/sync` |
| Additional photos/gallery (implemented) | `menu_item_images` | `/images/sync` |
| Stock, low-stock level, backorders | `menu_item_inventory` | `/inventory/sync` |
| Delivery/pickup/variant/scheduled prices | `menu_item_prices` | `/pricing/sync` |
| Available days, times and timezone | `menu_item_schedules` | `/schedules/sync` |
| Modifier choices (implemented) | `menu_modifier_options` | `/modifier-options/sync` |
| Modifier groups linked to an item/variant (implemented) | `menu_item_modifier_groups` | `/modifier-links/sync` |
| Combo master (implemented) | `menu_items` with `item_type=combo` | `/combo-items/sync` |
| Combo selection groups (implemented) | `menu_combo_groups` | `/combo-groups/sync` |
| Combo components (implemented) | `menu_combo_options` | `/combo-options/sync` |
| Item SEO title, slug and meta description | `menu_seo` | `/seo-meta/sync` |
| Item discounts/coupons (implemented) | `menu_offers` | `/offers/sync` |

Except for Combo Items, Variants, Modifier Options, Modifier Links, Combo Groups, Combo Options, Images and Offers, these child-resource POS routes are planned and have not
been implemented yet.
They must use the same scoped URL convention. Item category mapping is already
handled by `external_category_ids` in the current Items API; tax mapping is
already handled by `external_tax_id`. Neither needs an additional mapping API.
The single `image_url` is the item's main/fallback image; the Images resource
handles the gallery. `base_price` is the base price; the Pricing resource
will handle additional price rules.

Server-managed fields are not input: `id`, `store_code` (from URL),
`source_type=pos`, `sync_enabled=true`, `last_synced_at`, `created_at`, `updated_at`,
`created_by`, `updated_by` and `archived_at`. External category/tax IDs are resolved
to internal UUIDs by the server. Existing children remain intact when the item
master is updated. Do not send child resources as nested item payloads; the
current Items endpoint does not process them.

### POS modifier groups API

`POST /api/pos/stores/{store_code}/modifier-groups/sync` writes to
`menu_modifier_groups`. The store code comes only from the URL; there is no
shared/body-based route. Send `Authorization: Bearer <store-token>` and
`Content-Type: application/json`. The store's POS Integration panel also shows
this URL. Apply `npm run db:migrate:deploy` before use: migration
`20261105120000_allow_modifier_group_sync_log` allows `MENU_MODIFIER_GROUP` logs.

Complete examples: `examples/pos-modifier-groups.json` and
`examples/pos-modifier-groups.http` (insert followed by update).

The body requires a nonblank `request_id` (at most 100 characters) and a nonempty
`modifier_groups` array. There is no fixed record-count maximum; the shared
256KiB JSON body-size limit applies. Each group requires `external_group_id`
(nonblank, at most 100 characters) and `name` (nonblank, at most 150 characters).

| Optional field | New record default | Validation |
| --- | --- | --- |
| `description` | null | Text, at most 10,000 characters; null/empty clears it |
| `selection_type` | `single` | `single` or `multiple` |
| `min_select` | 0 | Nonnegative integer |
| `max_select` | 1 | Integer at least `min_select`; must equal 1 for `single` |
| `display_order` | 0 | Nonnegative integer |
| `allow_option_quantity` | false | Boolean |
| `is_active` | true | Boolean |
| `rules` | null | JSON object; null clears it |
| `configuration` | null | JSON object; null clears it |

Integer fields may not exceed 2,147,483,647. Each JSON object is limited to
30,000 serialized characters. Updates preserve omitted optional fields, and
selection limits are checked against the resulting existing/new values together.
Groups can be created before items and options, even with a positive minimum;
the options must be uploaded before creating required item-modifier mappings.

Matching uses `(store_code, external_group_id)`. New IDs insert with
`source_type=pos`. Existing POS-owned, unarchived groups update in place,
preserving their UUID, options and item links. Manual or archived matching
records return 409. Omitted groups are unchanged. Explicit `is_active=false`
deactivates an incoming group; `deactivated_count` remains 0 because no omitted
rows are bulk-deactivated. Invalid input returns 400, invalid/disabled tokens
401, and unauthorized/inactive/ambiguous stores 403. The entire batch is atomic.

Use a new `request_id` for each new change. Successful replays return original
counts with `X-POS-Replayed: true` and no new writes. Failed requests can be
corrected and retried. UUID, source ownership, archive state and timestamps are
server managed.

Example response for one inserted group:

```json
{
  "success": true,
  "message": "Modifier groups synchronized successfully",
  "store_code": "YOUR_STORE_CODE",
  "received_count": 1,
  "inserted_count": 1,
  "updated_count": 0,
  "deactivated_count": 0,
  "status": 1
}
```

Run `npm run test:pos:modifier-groups` with `.env` configured for PostgreSQL.
It exercises the real scoped route and token authentication using uniquely
named temporary fixtures that are removed afterward. Coverage includes partial
updates, defaults, selection validation, preservation of item links, a batch of
101 groups, ownership protection, replay/concurrency and atomic rollback.

### POS tax rules API

`POST /api/pos/stores/{store_code}/tax-rules/sync` writes to `menu_tax_rules`.
The store code is required in the URL, with no body-based alternative route.
The URL requires `Authorization: Bearer <store-token>` and
`Content-Type: application/json`. The admin store POS panel displays the scoped
URL. Apply `npm run db:migrate:deploy` before use: migration
`20261103150000_allow_tax_rule_sync_log` permits `MENU_TAX_RULE` success/failure
logs. The preceding tax migration removes the unused JSON columns.

Request examples: `examples/pos-tax-rules.json` and
`examples/pos-tax-rules.http` (includes separate insert and update requests).
The body requires `request_id` (nonblank string, at most 100 characters) and a
nonempty `tax_rules` array with no fixed record-count maximum. A single rule is
sent as an array containing one object. The existing 256KiB JSON body-size limit
still applies. Each record requires `external_tax_id`
(nonblank, at most 100 characters), `name` (nonblank, at most 150 characters),
and numeric `rate_percent` (0–100, at most four decimal places). Optional
`price_includes_tax` and `is_active` must be booleans; when omitted, new records
default to false/true respectively, and updates preserve their existing values.
Optional `configuration` must be an object of at most 30,000 serialized
characters; omission preserves it on update and explicit null clears it.
UUIDs, source ownership, archive state and timestamps are server managed.

Matching uses `(store_code, external_tax_id)`. Existing POS-owned, unarchived
rows update in place, keeping their UUID and linked items. New IDs insert with
`source_type=pos`. Manual or archived matching rows return 409. No categories,
items or modifiers need to exist before creating tax rules. Omitted rules are
unchanged; send `is_active=false` explicitly to deactivate a POS rule. An invalid
record or ownership conflict rolls back the entire batch. Duplicate external
IDs, invalid rates/booleans and missing fields return 400. Invalid/disabled
tokens return 401; unauthorized, inactive or ambiguous stores return 403.

Use a new `request_id` for each new change. Successful replays return the original
counts with `X-POS-Replayed: true`, without applying the data again. A failed
request may be corrected and retried with its original request ID.

Example response for one new rule:

```json
{
  "success": true,
  "message": "Tax rules synchronized successfully",
  "store_code": "YOUR_STORE_CODE",
  "received_count": 1,
  "inserted_count": 1,
  "updated_count": 0,
  "deactivated_count": 0,
  "status": 1
}
```

Run `npm run test:pos:tax-rules` with `.env` configured for PostgreSQL. It exercises
the real route handler and real bearer-token authentication, creates unique
temporary store fixtures and removes them afterward. Coverage includes rates,
ownership, defaults, configuration, item links, replay/concurrency, store
isolation, batch rollback and failed-request retry.

### Incremental category API

**Current category API (menu table):** `POST /api/pos/stores/{store_code}/categories/sync`
writes to `menu_categories` through Prisma `MenuCategory`, not
`tbl_website_category`. The store code is required in the URL. Use
`Authorization: Bearer <store-token>` and `Content-Type: application/json`.
Hero banner sync also requires `/stores/{store_code}` in its URL.

Copy the complete request body from `examples/pos-menu-categories.json`.
`request_id` (1–100 characters), `external_category_id` (1–100 characters per
category) and `category_name` (1–150 characters) are required. Send 1–100 categories.
`description` defaults to empty text, `image_url` to null, `display_order` to 0,
and `is_visible` to true. `is_active` is an optional boolean: new rows default to
true; updates preserve the current value when omitted. Each incoming category
is a complete record for the other fields, rather than a partial PATCH.

Matching uses `(store_code, external_category_id)`: new IDs insert; existing IDs
update while retaining the UUID and item-category links. Omitted categories are
unchanged. Rows are written with `source_type=pos`, `sync_enabled=true` and a
server-generated `last_synced_at`. The client cannot choose UUIDs, source ownership,
archive state or audit timestamps. A manual, archived or sync-disabled matching
row causes HTTP 409 and rolls back the entire batch. Duplicate IDs, missing IDs,
invalid booleans or invalid images cause HTTP 400. Invalid/disabled tokens return
401; unauthorized stores return 403.

Use a new `request_id` for each new change. Reusing a successful request ID returns
the original counts with `X-POS-Replayed: true`. Menu-category logs now use
`MENU_CATEGORY` in `tbl_pos_sync_log` so an older website-category success cannot
skip a new menu-table write. Existing website categories are not migrated or
deleted; resending the categories with a new request ID populates the menu table.
Apply migrations with `npm run db:migrate:deploy`. Migration
`20261103130000_allow_menu_category_sync_log` adds `MENU_CATEGORY` to the
`tbl_pos_sync_log.sync_values` constraint; without it the database rejects the
success log and rolls back category writes.

Example response for two new IDs:

```json
{
  "success": true,
  "message": "Categories synchronized successfully",
  "store_code": "YOUR_STORE_CODE",
  "received_count": 2,
  "inserted_count": 2,
  "updated_count": 0,
  "deactivated_count": 0,
  "status": 1
}
```

Run `npm run test:pos:categories` for the focused in-memory regression suite.
It covers insert/update, request replays, old log separation, input validation,
store isolation, manual/archive/sync-disabled protection and atomic batch rollback.
This suite does not exercise a live PostgreSQL server.

The paragraph below describes the previous website-category implementation:

Category POS requests write only incoming items. The API no longer deactivates omitted categories. Existing category status is preserved on updates, including status=0 set by Admin. New categories use status=1. Category deactivation remains available through Admin removal. Only changed/new categories need to be sent; unrelated records remain unchanged. New category-sync responses and logs have deactivated_count=0. Replaying an old request_id still returns its original historical response; use a new request_id to apply new changes. Existing inactive rows are not automatically reactivated. The hero API retains its single-active-banner rule.

### Local image URLs

The HTTPS-only requirement has been removed for hero/category/admin image URLs. Examples: `http://localhost:5173/images/hero.jpg`, `http://192.168.1.10:8080/banner.jpg`, `/uploads/category.jpg`. The server still does not fetch these URLs. Temporary blob/data strings are not persisted, and uploaded file type/size checks are unchanged. No migration is required.
