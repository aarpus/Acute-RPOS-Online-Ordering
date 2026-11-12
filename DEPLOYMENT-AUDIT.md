# Cloudflare deployment audit — 2026-11-12

## Loading performance — measured follow-up

Live baseline from the same client: `/api/hello` 318 ms, admin Stores HTML 136 ms,
and repeated `/api/home` requests 5,969 / 5,700 / 5,593 ms (median 5,700 ms).
The slow path was the database-backed catalog rather than HTML delivery. The
catalog performs many relation reads and uses a consistent database transaction;
admin menu workspace loading also issues many queries within a transaction.

Changes:

- `wrangler.jsonc`: placement hint `region: aws:us-east-2`, matching the existing
  Neon origin region, places backend execution near the database to reduce repeated
  cross-region query latency. Hyperdrive ID, database and transaction semantics
  are unchanged. No cache, query semantics, schema migration or data changes.
- `components/StoreProvider.tsx`: avoid immediately refetching the same initial
  Delivery catalog already fetched by the parent. Pickup/Delivery changes still
  request mode-specific pricing/availability, abort obsolete requests and reset
  on store/parent-data changes. No UI layout or pricing rules changed.

TypeScript, storefront/session regression tests, production build and Wrangler dry
run passed. Cloudflare confirmed deployment of version
`33dcd1d2-2855-4b79-8392-dc542da4d4e4`, retaining live variables/secrets/bindings.

Post-deployment `/api/home`: 2,529 / 2,030 / 1,565 ms (median 2,030 ms), each HTTP
200 with the same store `demo1002` and 18 products. This is approximately a 64%
reduction in this small sample's median API latency, not a guaranteed latency/SLA.
The first dynamic HTML and hello requests were slower (720 / 928 ms), reflecting
the single-region round trip and deployment warmup tradeoff. Static assets remain
served from the edge. Signed-in admin API timing was not measured without the
user's credentials; it uses the same relocated backend, but its full browser
loading improvement is not independently certified here.

R2 remains unconfigured. It is not required for serving the application or existing
public/static image URLs. The current file-upload handler still requires image
storage; without R2, checked-in `public/images` assets can be deployed and
referenced by `/images/...`, or externally hosted image URLs can be used where
supported. No R2 bucket or alternative storage resource was created.

Reference: [Cloudflare placement configuration](https://developers.cloudflare.com/workers/configuration/placement/).

## Admin panel empty despite existing data — follow-up

Read-only counts confirmed the current online database contains the imported menu,
orders, customers and branding. Hyperdrive's configured host/database match this
datasource. The data was hidden by a reversed company/store mapping in one imported
`tbl_store` row: `store_code=STORECODE123`, `company_code=demo1002`, while both admin
accounts belong to company `STORECODE123` and the business data belongs to store
`demo1002`. The separate local reference database had the correct mapping.

A full backup was verified at
`.local-backups/database-before-recovery-2026-11-12T08-43-46-802Z.dump` before repair.
`scripts/repair-store-scope.mjs` first passed a rollback-only probe, checking the
reference store identity, exact reversal, matching admin/data scopes and absence
of conflicting store codes. It then updated exactly one live row to
`store_code=demo1002`, `company_code=STORECODE123` in a transaction. No admin scope,
password, order, catalog row, customer row or authorization rule was changed.

Post-repair visibility checks show both Admin and Super Admin can resolve 1 store,
22 non-archived menu items, 3 orders and 1 customer through the existing company/
store filters. The 24 total menu-item rows include 2 archived rows, which remain
archived. The live public API returned store `demo1002`, 18 available products,
12 public categories and configured branding after the repair.

Live logs also identified missing Suspense boundaries for `useSearchParams()` on
the Stores page. Added boundaries with null fallback to the server route wrappers
for Stores list/new/edit and Customers. Existing Menu already had its boundary.
No component layout, styling or business logic changed. Original wrappers were
preserved under `.local-backups/admin-render-before-fix-*`.

TypeScript, production build and final Wrangler dry run passed. Built-Worker local
GET checks returned 200 for all four affected routes without the missing-Suspense
error. The update uses `--keep-vars` to preserve live Worker variable configuration;
secrets and the original Hyperdrive binding are preserved. No R2 resource is created.

New diagnostics: `scripts/check-admin-data-sources.mjs` compares table counts and
tenant codes without exposing credentials, and `scripts/check-admin-readiness.mjs`
now reports counts visible through existing admin company scopes.

Cloudflare confirmed deployment of version
`4075d577-236b-4e93-8905-fb395fa34257` at
`https://rpos-online-ordering.webacc.workers.dev`. Live GET checks returned 200
for Stores list/new/edit, Customers and the customer session endpoint. These page
checks do not replace a signed-in browser acceptance test; no admin password was
requested, guessed or used. The user should refresh the admin panel to reload the
corrected store selection and data.

## Live admin login 500 — signing-secret fix

The user reported POST `/api/admin/login` returning 500 at
`https://rpos-online-ordering.webacc.workers.dev`. Read-only database diagnostics
confirmed 2 admin accounts, 1 store, valid password-hash formats, no ambiguous
normalized admin emails, and successful Prisma admin queries. No accounts were
created, no passwords were reset, and no database credentials were changed.

Cloudflare initially reported no Worker secrets. Live error logs explicitly
identified `EMAIL_VERIFICATION_SECRET`, which admin-session signing requires.
The existing valid local signing secret was supplied to Wrangler through stdin
and added as that production secret without printing it. Cloudflare confirmed
the secret upload and a Secret Change deployment. No source-code deployment was
needed for this fix. After the updated version became active, the empty-credential
login probe returned **401** instead of 500, confirming that session configuration
and the runtime database query now reach normal credential validation.

An authenticated login was not attempted because the user's actual credentials
were not provided or guessed. Existing users should retry with their own admin
email/password. SMTP secrets/settings remain a separate email-readiness task.

Added read-only helpers: `scripts/check-admin-readiness.mjs` (counts/configuration
checks without printing identities/hashes/secrets) and
`scripts/read-admin-login-errors.mjs` (redacted parsing of ignored local tail logs).
The local .env and .dev.vars database settings differ; neither was overwritten.

## P3018 recovery for the newly configured online database

This follow-up supersedes the earlier datasource inventory below. The current
`.env` pointed to an online database with only `users`, `admin` and migration
history, four applied migrations, and a failed `20261029063000_add_store_time`.
The connection string was not changed by this repair.

Root cause: the original migration history assumed a pre-existing `tbl_store`
table without ever creating it. Added the additive prerequisite migration
`20261029060000_create_store_table`, using `CREATE TABLE IF NOT EXISTS` and
`CREATE INDEX IF NOT EXISTS` so existing installations preserve their store table.
Historical migration files were not edited.

Before database writes, a full custom-format backup was saved under ignored
`.local-backups/database-before-recovery-2026-11-12T07-52-35-230Z.dump`; its archive
listing and nonempty size were verified. This was not a full restore test.
The failed store-time attempt was marked rolled back, then Prisma deployment
successfully created the prerequisite table and resumed the migration chain.

A second pre-existing issue surfaced at `20261103120000_create_order_tables`:
`OrderActorType` already existed. A transactionally rolled-back probe exposed
the actual duplicate-enum error hidden by the generic aborted-transaction error.
`scripts/recover-order-migration.mjs` verified the existing enum's exact labels
and order, reused it, and executed all remaining SQL from the unchanged order
migration in a transaction. The successful SQL completion was then recorded via
`prisma migrate resolve --applied`, following Prisma's forward-recovery workflow.
No enum, table or application data was dropped during recovery.

Added helpers: `scripts/backup-database.mjs` (credentials passed only through
child-process environment), `scripts/inspect-failed-migration.mjs` (inspection and
optional transactional rollback probe), and `scripts/recover-order-migration.mjs`
(guarded one-time recovery, dry-run by default). Do not rerun the recovery helper
after the migration has been resolved; it deliberately requires an active failure.

Final recovery verification passed:

- `prisma migrate deploy`: **All migrations have been successfully applied.**
- `prisma migrate status`: **31 migrations found; Database schema is up to date!**
- Read-only inventory: **35 public tables / 34 application tables**, all 34 Prisma
  models covered; no missing or unmanaged application tables.
- Migration audit: **31 applied**, no pending, modified, unresolved failed or
  database-only migrations. Historical failed attempts remain recorded as resolved.
- Live database to Prisma datamodel comparison: **No difference detected.**

Only database migration recovery was performed in this follow-up; no Worker
deployment, R2 provisioning, credential replacement, database reset or data copy
from the previous local database was performed.

Reference: [Prisma failed-migration recovery](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing).

## Existing database and all 35 tables — follow-up

The user chose to retain the current database. No connection string or Hyperdrive
origin was changed. A read-only inventory confirmed 35 public tables: 34
application tables matching all 34 Prisma models, plus `_prisma_migrations`.
No application table is missing or unmanaged. All 30 migration files are already
applied, with matching checksums and no pending or failed migration.

A deeper read-only Prisma comparison found 14 existing `(store_code, archived_at)`
indexes missing from the Prisma schema declarations. These indexes were already
created by migration `20261030150000_menu_crud_and_seo`. Their exact mapped
`@@index` declarations have now been added to `prisma/schema.prisma`; no historical
migration was edited, no database DDL was executed, and no table/data was changed.
The original schema was preserved in `.local-backups/schema-before-index-sync-*`.

The final read-only comparison returned **No difference detected**:

```powershell
node --env-file=.env scripts/check-deployment-database.mjs
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Prisma Client generation, TypeScript (`npx tsc --noEmit`) and the production
build (`npm run build`) passed after the schema synchronization. Existing
migrations cover the current database state; recreating the 35 tables is neither
needed nor safe. Changing a connection string alone would not copy schema or data
to a different database. In particular, historical migrations assume `tbl_store`
already exists, so a future empty-database move requires a reviewed baseline/data
transfer rather than blindly replaying this history. This does not affect the
chosen existing database.

## Follow-up fix for Cloudflare error 10143

The initial audit below retained the external response-store binding. Cloudflare
rejected application deployment because that service does not exist yet, and its
R2 prerequisite is still unavailable. The active configuration now defaults to
running without the external response cache. `vite.config.ts` enables both the
adapter and its `RESPONSE_STORE` service binding together only when the build-time
setting `RPOS_RESPONSE_STORE_ENABLED=true` is supplied. The target service name,
entrypoint, response-store Worker config, cache bucket config and Hyperdrive are
preserved. Application routes, database behavior, UI and branding handling are unchanged.

Do not deploy the source `vinext/server/fetch-handler` directly. Build first and
deploy its generated configuration:

```powershell
npm run build
npx wrangler deploy --dry-run --config dist/server/wrangler.json
# After confirming required application variables and secrets:
npx wrangler deploy --config dist/server/wrangler.json
```

No response-store Worker or R2 bucket is required in the default mode. Persistent
response caching is deferred; this changes caching infrastructure, not application
features. SMTP variables/secrets and the Hyperdrive binding are still required.

Later, after the administrator provisions CACHE_BODIES and deploys the response
store, enable it for an application rebuild:

```powershell
npm run deploy:response-store
$env:RPOS_RESPONSE_STORE_ENABLED = 'true'
npm run build
npx wrangler deploy --dry-run --config dist/server/wrangler.json
# After validating the existing target service and application settings:
npx wrangler deploy --config dist/server/wrangler.json
Remove-Item Env:RPOS_RESPONSE_STORE_ENABLED
```

The original audit below describes the earlier cache-enabled configuration;
this follow-up supersedes its response-store deployment blocker for the default build.

Follow-up validation: Wrangler types regenerated; TypeScript and production build
passed; final application dry run passed and confirmed no RESPONSE_STORE binding,
with the original Hyperdrive ID intact. The rebuilt production Worker returned
200 locally for `/`, `/api/home`, `/api/auth/session` and `/admin/login`, without
starting a cache service. No remote deployment was performed.

## Checklist

- [x] Inventory application, API routes, Prisma schema/migrations, configuration, dependency lockfile and existing backups.
- [x] Preserve pre-audit configuration and changed source under ignored `.local-backups/cloudflare-audit-*`.
- [x] Identify existing uncommitted changes; retain them and all original backup files.
- [x] Make Wrangler the explicit build/deploy path; preserve legacy configuration as a reference.
- [x] Enforce Hyperdrive for production database connections; preserve local DATABASE_URL.
- [x] Remove direct DATABASE_URL requirements from authentication and email verification.
- [x] Reconcile generated bindings, image optimization, response-store local development and optional branding R2.
- [x] Generate Prisma Client and Wrangler types, then run TypeScript and production build.
- [x] Validate both Worker configurations with Wrangler dry runs.
- [x] Verify Cloudflare identity and existing resource state; secret listing confirms the application Worker does not exist yet.
- [x] Check database migration status without applying migrations or changing data.
- [ ] Deploy only after required production settings/resources are confirmed, then verify runtime behavior.

User confirmed this is the correct Cloudflare account and requested local validation only. R2 setup will be handled later by the user's administrator. No remote Worker was created or deployed, no remote bucket was created, no credentials were changed, and no database migrations were applied.

## Problems found and exact changes

| File | Audit change |
| --- | --- |
| `lib/prisma.ts` | Added a shared connection resolver. Uses `HYPERDRIVE.connectionString`; throws in production if absent, instead of falling back to direct credentials. Retains Worker/Node DATABASE_URL fallback in development. Existing PrismaPg adapter and per-operation client/disconnect lifecycle retained. |
| `lib/auth.ts` | Removed the direct DATABASE_URL prerequisite from signing/session configuration. Database access validates its binding when Prisma is created. |
| `app/api/auth/email-verification/route.ts` | Removed its redundant direct DATABASE_URL prerequisite; added process.env fallbacks for SMTP settings consistent with local operation. Signing, OTP, authorization and mail behavior retained. |
| `package.json` | `dev` and `build` now invoke Vite directly. `deploy` builds then runs Wrangler against the generated `dist/server/wrangler.json`; `deploy:vinext` delegates to it. `cf-typegen` uses `wrangler types --config wrangler.jsonc`. This avoids the installed Vinext deployment CLI's selection of `cf` merely because `cloudflare.config.ts` exists. |
| `vite.config.ts` | Explicit Wrangler config path, explicit service-binding cache mode, dev-only auxiliary response-store Worker, local nonsecret variables from .env, local Hyperdrive connection override kept in process memory. Retained generated Prisma WASM alias, optimizer, asset handling, and rsc/ssr environments. |
| `wrangler.jsonc` | Added the missing `IMAGES` binding required by the existing imagesOptimizer. Formatted configuration. Preserved Worker name, Hyperdrive ID, response service/entrypoint, assets, version metadata, compatibility date/flags and cache settings. |
| `cloudflare-env.d.ts` | Removed the handwritten Hyperdrive shape so generated Wrangler types own it. Optional branding uses `BRANDING_IMAGES?: R2Bucket`. Other application setting declarations remain; declarations do not provision production values. |
| `worker-configuration.d.ts` | Regenerated with Wrangler; includes real Hyperdrive, Images, assets, service and runtime types. Local .dev.vars names may appear in these types; this does not mean they exist remotely. |
| `tsconfig.json` | Excludes backups, old generated .cloudflare types and dist from application type checking, avoiding stale or duplicate declarations. |
| `cloudflare.config.ts` | Added a legacy-reference comment. Preserved the entire old configuration and `cf` dependency; active scripts and plugin explicitly bypass it. |
| `.env.example`, `.dev.vars.example` | Removed the misleading invented branding bucket name and env-only provisioning instructions. |
| `README.md` | Corrected local Vite workflow, production Hyperdrive requirement and secret guidance; links this report. |
| `scripts/test-worker-database.mjs` | New network-free tests for production/direct-URL isolation, local fallback, absent R2 behavior and upload authentication ordering. |
| `scripts/check-deployment-database.mjs` | New read-only PostgreSQL connectivity/migration checksum audit; never prints credentials or detailed driver errors. |
| `DEPLOYMENT-AUDIT.md` | This checklist, findings, validation limits and remaining commands. |

`wrangler.response-store.jsonc` was reviewed and dry-run validated without changes. Its declarative SQLite Durable Object export is supported by the installed Wrangler; no duplicate migration was added. `package-lock.json` was already modified before this audit and remains byte-for-byte identical to the audit baseline. No dependency change or npm install was needed. `tsconfig.tsbuildinfo` was refreshed by TypeScript and was also already modified before the audit.

Installed core versions: Vinext 1.3.1, @vinext/cloudflare 1.2.1, Vite 8.3.0, Wrangler 4.160.1, Cloudflare Vite plugin 1.69.0, Prisma/client/adapter-pg 6.19.3, pg 8.23.1. Existing lockfile retained. Some manifest ranges remain `latest`; use `npm ci` with the reviewed lockfile for reproducible installation rather than upgrading during deployment.

## Validation results

| Check | Result |
| --- | --- |
| `npx prisma generate` | PASS, Prisma Client 6.19.3 |
| `npx wrangler types --config wrangler.jsonc` | PASS |
| `npx tsc --noEmit` | PASS, including a repeat after the final source change |
| `npm run build` | PASS; final build uses Vite and emits Worker, SSR modules, Prisma query compiler WASM and client assets |
| `npx wrangler deploy --dry-run --config dist/server/wrangler.json` | PASS on final build; 200 modules, ~4,648 KiB uncompressed / ~1,430 KiB gzip |
| `npx wrangler deploy --dry-run --config wrangler.response-store.jsonc` | PASS, cache R2 and SQLite Durable Object recognized |
| `node scripts/test-worker-database.mjs` | PASS, Hyperdrive policy and missing R2 tests |
| `node scripts/test-storefront.mjs` | PASS, store filtering, branding, session signatures, expiry, deleted/cross-store users |
| `node scripts/test-checkout-auth.mjs` | PASS, return paths, redirect allowlist and session failures |
| Menu creation and visibility tests | PASS |
| `node scripts/test-menu-design.mjs` | Existing failure: BrandingWorkspace signature differs from stored signature. The component is unchanged from repository HEAD and was not edited in this audit. Signature and UI left intact. |
| `node --env-file=.env scripts/check-deployment-database.mjs` | PASS, read-only connection; 30 local and 30 applied migrations, no pending/modified/failed/database-only entries |
| Local secret-value scan | PASS for DATABASE_URL, SMTP_USER, SMTP_PASSWORD and EMAIL_VERIFICATION_SECRET against client assets and generated production Wrangler config |
| Whitespace check with CRLF recognized | PASS |

Sandbox-only Prisma generation/build attempts failed because binary access was blocked, and Wrangler initially failed to spawn a child process. Approved runs outside the sandbox passed. These were environment restrictions, not application build failures.

Build warnings remain in upstream Vinext/RSC plugins: missing sourcemaps on transforms, callback timing notices, and routes that static analysis cannot classify. The build exits successfully. Runtime route checks were used to supplement that classification.

### Local runtime checks

Vite development: `/api/hello`, repeated database-backed `/api/home`, `/api/auth/session`, `/admin/login`, `/cart` and `/login` returned 200. Unauthenticated `/api/admin/session` and `/api/admin/orders` returned 401. A valid-shaped media key without branding storage returned 404. GET against a POST-only POS endpoint returned 405.

Built production Worker preview: `/`, `/api/hello`, `/api/home`, `/api/auth/session`, `/admin/login` and `/cart` returned 200; `/api/admin/session` returned 401. A single-Worker Vite preview logs response-store misses because it does not start the dev-only auxiliary cache Worker. Those misses fall back to normal rendering.

The built application was then started together with the actual response-store service using multi-config `wrangler dev`. The same routes passed, including repeated home-page requests, with no response-store errors in that session. R2 and Durable Object storage were emulated locally; nothing was created in Cloudflare.

For a future full-stack local built-Worker check in PowerShell:

```powershell
# Read only the local database URL into the emulator's process environment.
foreach ($line in Get-Content -LiteralPath '.env') {
  if ($line -match '^DATABASE_URL=(.+)$') {
    $env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = $Matches[1].Trim().Trim([char]34).Trim([char]39)
  }
}
npx wrangler dev --config dist/server/wrangler.json --config wrangler.response-store.jsonc --port 3003
```

Run one local stack at a time so duplicate Worker names do not compete in Wrangler's local service registry.

## Database, authentication and runtime readiness

- Hyperdrive ID `a9845ceea3d54b28a3dc3a9b7138feb3` exists in the confirmed account and remains bound as `HYPERDRIVE`. It was not recreated or updated.
- All runtime Prisma clients use the common factory. Standalone maintenance scripts use their explicit DATABASE_URL and are not Worker runtime entrypoints. The generated WASM client alias avoids filesystem compiler loading in Workers; PrismaPg/pg and nodejs_compat remain in place.
- The configured DATABASE_URL passed read-only PostgreSQL connectivity and migration checks. Local Hyperdrive emulation also served database-backed requests. This does **not** verify real Cloudflare-to-origin Hyperdrive connectivity; that requires a deployed request later.
- Existing migrations include historical destructive DDL, including removal of the old email-verifications table and two tax-rule columns. None were executed. No migration is pending on the checked database.
- API/auth/POS/store/admin/order modules were inventoried and their imports/connection handling reviewed. Existing node:crypto usage is covered by nodejs_compat. Filesystem/process-management helpers are confined to maintenance/test scripts and build configuration. SMTP uses worker-mailer with a Node nodemailer fallback; external mail delivery was not exercised.
- Email-verification throttles/attempt counters include isolate-local Maps. They are not globally consistent across Workers isolates or isolate restarts. This existing limitation was preserved rather than changing authentication business logic during the deployment migration.
- No real registration, checkout write, admin mutation, live SMTP send, image transform or authenticated production upload was performed. Production behavior cannot be certified before resources, secrets and an actual deployment exist. HTTP smoke tests are not a complete visual/browser or end-to-end acceptance test.

## Production environment requirements

| Category | Required configuration / status |
| --- | --- |
| Bindings | HYPERDRIVE confirmed. ASSETS and CF_VERSION_METADATA configured. IMAGES now configured; production availability must be confirmed on deployment. RESPONSE_STORE points to the required named service/entrypoint, but that Worker does not yet exist. |
| Required secrets | SMTP_USER, SMTP_PASSWORD, EMAIL_VERIFICATION_SECRET (at least 32 characters). Production values have not been configured or verified because the application Worker does not exist. Local values were neither uploaded nor overwritten. |
| Plain variables | SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_FROM must be confirmed for production and added under `vars` in wrangler.jsonc. Present locally; generated production vars are intentionally empty rather than guessing production settings. |
| Optional scope settings | STORE_CODE is a server fallback for customer addresses; request-selected stores remain authoritative. COMPANY_CODE falls back to authenticated admin scope; ADMIN_USER_ID defaults to 0. Set these only if the installation requires specific values; none were invented. |
| DATABASE_URL | Local development and controlled maintenance/migration commands only. Not required as an application production secret; production runtime deliberately requires Hyperdrive. |
| Local files | .env, .dev.vars, dist and .local-backups are ignored; neither local credential file is tracked. Generated dist/server/.dev.vars is a local preview artifact and must never be committed or shared as a deployment archive. |

No credential values are included in this report.

## R2 and response-store status

Cloudflare reported R2 is not enabled in the confirmed account. The application Worker `rpos-online-ordering` and response-store Worker `rpos-online-ordering-response-store` do not yet exist. The secret-list request therefore cannot confirm any remote secrets.

The response store needs the **already specified** bucket `rpos-online-ordering-response-store-cache-bodies` under its `CACHE_BODIES` binding and its declarative `CacheMetadata` SQLite Durable Object. Existence of that bucket cannot be verified until R2 is enabled. The administrator must check existing resources before provisioning anything; this audit created none.

Branding R2 remains deliberately unconfigured. No bucket name was invented. Missing BRANDING_IMAGES already returns a controlled 503 for authenticated uploads, 401 before storage checks for unauthenticated uploads, and 404 for media reads. Menu image uploads reuse the same authenticated branding handler, so uploads there also require future branding storage. Existing external/static image URLs and the rest of the application remain available.

To enable branding later:

1. Have the administrator provision or identify the intended branding bucket.
2. Add its actual name under `r2_buckets` in **wrangler.jsonc**, binding `BRANDING_IMAGES`; do not point it at CACHE_BODIES.
3. Run `npm run cf-typegen`, `npx tsc --noEmit`, and `npm run build`, then the Worker dry run.
4. Deploy after the production checklist is satisfied; verify a signed-in admin upload and its `/api/media/...` URL. No UI/route architecture rewrite is needed.

## Remaining deployment sequence — not executed

First, the administrator must enable R2 and confirm/provision the specified response-store cache bucket. Confirm the production plain variables and add them to the source Wrangler `vars` object. Confirm SMTP credentials and a strong signing secret through a secure channel, not chat or source files.

After those requirements are satisfied, use the existing names and account:

```powershell
npx wrangler whoami
npx wrangler hyperdrive list
npx wrangler r2 bucket list

# Prompts accept values without putting them in shell arguments or source files.
# On the first command, Wrangler may offer to create the absent named Worker.
# Only accept that intended Worker creation after checking the account/name.
npx wrangler secret put SMTP_USER --config wrangler.jsonc
npx wrangler secret put SMTP_PASSWORD --config wrangler.jsonc
npx wrangler secret put EMAIL_VERIFICATION_SECRET --config wrangler.jsonc
npx wrangler secret list --config wrangler.jsonc

npx prisma generate
npm run cf-typegen
npx tsc --noEmit
node scripts/test-worker-database.mjs
node --env-file=.env scripts/check-deployment-database.mjs
npm run build
npx wrangler deploy --dry-run --config wrangler.response-store.jsonc
npx wrangler deploy --dry-run --config dist/server/wrangler.json

# Deploy the cache service first, after its bucket is confirmed.
npm run deploy:response-store
npx wrangler deployments list --config wrangler.response-store.jsonc

# Deploy the application only after all bindings, variables and secret names are confirmed.
npm run deploy
npx wrangler deployments list --config wrangler.jsonc
```

Do not run `prisma migrate deploy` merely as part of deployment: the checked database is already current. If a different production database is selected, audit it read-only and review any proposed migration separately.

After Cloudflare confirms deployment, verify the returned URL, real Hyperdrive database reads, customer/admin login and tenant isolation, email verification and order emails, order placement/status updates, dynamic routes, static assets, image optimization, and response-store behavior. Branding uploads remain unavailable until its separate bucket is configured.

References: [Cloudflare Hyperdrive PostgreSQL driver guidance](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/prisma-postgres/), [Vinext Cloudflare example](https://github.com/cloudflare/vinext/blob/main/examples/app-router-cloudflare/vite.config.ts). Version-specific decisions were also checked against the installed package sources and `@cloudflare/workers-response-store/README.md`.
