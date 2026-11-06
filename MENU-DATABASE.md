# Database-backed menu

Open `/admin/menu`, select a store, create categories and tax rules, then add
items. All 11 menu sections use PostgreSQL. No demo catalog is automatically
inserted; an empty store shows an empty menu.

## Editing in the original design

### Combo Master

The former Combo Items screen is named **Combo Master**, retaining its existing
`?view=combo-items` link. Save the combo details first, then open **Combo Groups**.
Create a group with minimum/maximum picks (or include all its options), save it,
and use **Add Option** to select regular menu items, quantities, extra prices,
default selections and availability. Group and option saves persist immediately;
updates and deletions use the same transactional parent save and archive history.
Required groups with too few available options are not orderable until completed.
The customer customization form enforces each group's selection limits.

Existing `menu_combo_groups` and `menu_combo_options` tables already contain all
required fields, so this change needs no database migration. Group structure lives
in those tables, rather than a duplicate `configuration.groups` document. Basic
item edits preserve the groups' pick limits, quantities and extra prices.

Leave a combo option's Extra Price blank to use its component item's current
effective default-variant price for the order mode/time, multiplied by its
included quantity. An entered amount overrides that calculation; an explicit
zero means no extra charge. Blank is represented by `extraPrice: null` in writes
and stored as `configuration.useItemPrice: true` with the existing numeric column
set to zero. Existing zero-price options retain their existing behavior. No schema
migration is required. The same rule applies to fixed and selectable groups.

All 11 original screen layouts are restored. Existing tables, tabs, form controls,
previews, buttons, class names and stylesheets are retained. No generic database
editor or additional JSON editor is displayed. The existing Save, toggle, bulk,
copy and Delete actions call the database service; Delete archives records.

Items and Combo Items share `menu_items`. Existing item tabs write variants,
images, inventory, schedules, modifier assignments, combo components and SEO in
transactions. Their standalone screens read/write the same records. Supplementary
original form fields are preserved in validated configuration/legacyForm JSON.
The adapters are in `lib/menu-legacy-codec.ts`; the shared state and image upload
bridge is in `components/admin/legacy-menu-client.tsx`.

Dropdown options and category samples come from the selected store's database,
without replacing the original controls. No demo rows are seeded. The existing
store query parameter remains supported; without it, the first company-authorized
store is used. Navigation preserves an explicit store query parameter.

Success messages appear only after commits. Errors retain the draft and use the
original notice area. Saves block repeated actions while pending. Clean editors
refresh after related screens change data; unsaved drafts retain their version
and conflict rather than overwrite newer changes. Reload the page or select the
record again to discard a stale draft.

Images use the original upload controls and are persisted through the existing
store-namespaced R2 service before saving URLs. Copy creates new UUIDs and clears
external identifiers; item copies receive a fresh SEO slug. Variant removal
archives its owned stock/price/assignment rows atomically. Other linked dependency
guards remain enforced. Modifier choices on an item use its existing option
checkboxes and store the allowed option IDs on the shared group assignment.

Schedules with multiple targets are saved transactionally as per-item rows with
a shared group key. Standalone schedule edits reuse the item's initial inline
schedule, so an automatically created all-day window does not override the edited
availability window. Item and standalone SEO use the same store-scoped records.

## API

Admin endpoints require the signed admin session, authorized company/store and
the `store_code` query parameter. Every reference is checked within that store.
Writes enforce same-origin protection. Responses use `{success,data}` or
`{success:false,error}`. Store locks serialize writes and nested failures roll back.

| Request | Behavior |
| --- | --- |
| `GET /api/admin/menu/workspace` | Consistent snapshot of all menu resources |
| `GET /api/admin/menu/RESOURCE` | Unarchived resource list |
| `POST /api/admin/menu/RESOURCE` | Create; optional `children` arrays are atomic |
| `PATCH /api/admin/menu/RESOURCE/UUID` | Update; include last-read `updatedAt` |
| `DELETE /api/admin/menu/RESOURCE/UUID` | Archive; JSON body `{updatedAt}` |
| `POST /api/admin/menu/batch` | Atomic original-form operations with version preflight and new-record references |
| `POST /api/admin/menu/upload` | Raw bytes with matching image Content-Type |

Append `?store_code=CODE` to each URL. Resource names and writable fields are in
`lib/menu-contract.ts`. `items` includes all items; `combo-items` is its combo view.
Additional collections expose images, modifier options/assignments and combo
groups/options for the nested editors.

## Customer behavior

- Menu navigation comes from active, visible `menu_categories`, independently of
  branding categories. Products need a visible category, availability, an
  available size and valid schedule/stock. Multiple categories per item work.
- Existing store currency, locale and timezone settings remain unchanged. Active
  prices use `[startAt,endAt)` windows and highest priority, with variant/item
  base prices as fallback. Variant-specific prices precede item overrides.
  Equal-priority overlapping applicable windows are rejected; pickup/delivery
  windows may coexist. Dine-in prices do not apply to online orders.
- Schedule days use 1=Monday through 7=Sunday and each row's IANA timezone.
  Date limits are inclusive, end times exclusive. Overnight windows belong to
  their start day; equal start/end means all day. Opening windows use OR;
  matching `exception` windows block ordering. No opening rules means available
  except for exceptions. Delivery/takeaway/website flags are honored.
- Fixed combos automatically include their components. Selectable groups and
  modifiers enforce min/max distinct selections and variant assignment. Combo
  components must be regular items in the same store. Their default available
  variant supplies stock. Modifier quantity/rule settings persist; this phase's
  customer controls select each modifier option once.
- Demo checkout reloads the catalog for the mode and scheduled time, validates
  quantities/options/instructions, and aggregates stock over all cart lines and
  combo components. Server prices are authoritative. Changed prices return 409
  with refreshed cart/totals and require another confirmation.
- Page/category/item SEO metadata is used by the client-rendered storefront.
  This does not add server-rendered product landing pages or a sitemap.

Offers and tax settings persist. Advanced discount/tax calculation, coupon usage,
stock reservation/deduction, notifications, completed order storage and real
payments remain outside this phase. Daily discount/time-price settings are stored;
use explicit active price windows for live pricing. The hardcoded coupon is
disabled. Menu POS/JSON import controls are disabled; branding POS APIs stay separate.

## Migrations and checks

`20261030150000_menu_crud_and_seo` adds archive/configuration columns, SEO storage
and archive-aware inventory/assignment indexes. Applied migrations were preserved.
The new migration was applied to the configured localhost database after an
ignored verified menu/migration-history backup in `.local-backups/`.

For another environment, review pending migrations and back up before
`npm run db:migrate:deploy`. Regenerate Prisma and restart development servers
after installing the update. The legacy `tbl_store` must already exist; see
`prisma/MENU-MANAGEMENT.md`. Production deployment is separate.

```powershell
node node_modules/prisma/build/index.js validate
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run test:menu
npm run test:menu:design
npm run test:menu:schema
npm run test:storefront
npm run build
```

Both menu integration scripts create and clean up disposable PostgreSQL clusters;
neither reads `.env` or uses the configured database. Set `PG_BIN` if required.
Tests cover real admin authentication, company/store scope, CSRF, all 11 domains,
archives, dependency guards, conflicts, nested rollback, duplicate variant links,
prices, stock aggregation, modifiers, combos, SEO and overnight schedules.

The Vite build aliases runtime Prisma imports to its generated Worker/WASM client,
so the query compiler is bundled instead of read from a nonexistent Worker filesystem.
Production preview was checked on port 3109: customer API and admin page return 200,
and anonymous admin API requests return 401.

`test:menu:design` checks original class names/order for the ten retained workspace
components and hashes all eleven original stylesheets, plus restored Combo routing,
layout sections and tabs. CRUD integration tests also round-trip all original form
shapes, cross-screen prices/stock/SEO, schedule updates and variant deletion.
