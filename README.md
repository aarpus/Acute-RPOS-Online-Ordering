# Spice Table — Online Ordering Web

Your original Vinext + Cloudflare setup, with simple Tailwind components for home, product customization, cart, scheduling, checkout, payment preview, confirmation and tracking.

Read UPDATE-GUIDE.md for copying this update, and START-HERE.md for the code workflow.

```sh
npm install
npm run dev
```

Build: `npm run build`

Payment and order tracking use temporary demo data. No real payment is taken and no order is sent to a restaurant.

Customers must log in before proceeding from the cart to pickup/delivery
selection, contact details or payment. Login and registration return to the
requested checkout step and preserve the selected store and browser-tab cart.
Order submission also verifies the signed customer session for that store.

Email verification uses the configured SMTP server. It requires server-side `DATABASE_URL`, `EMAIL_VERIFICATION_SECRET` (at least 32 characters), `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `SMTP_USER`, and `SMTP_PASSWORD`. For local Worker development, copy `.dev.vars.example` to `.dev.vars` and set the SMTP credentials, database URL, and verification secret there. Put the non-secret SMTP settings in `.env`. These files are local-only; never put credentials in browser code or source control. For Cloudflare deployment, configure the SMTP credentials, database URL, and verification secret as Worker secrets and the remaining SMTP settings as Worker variables. Verification state is kept in a signed, HTTP-only cookie; no email-verification database table is used.

Run the development server with `npm run dev` so Vinext loads `.env` for server-side API routes. Restart the server after changing environment variables. Direct `vite dev` does not preload `.env` into `process.env`.

Store details and codes are saved in the database through Admin > Stores. The frontend dropdown lists active, non-deleted database stores and defaults to the first store by ID. Store selection and details come from the database; no store environment setting is required. Store codes must be unique. Store contact details come from the database. Frontend API requests send x-store-code and the server validates that selection. Authentication and verification remain scoped to that code; cart, checkout, account drafts and demo order history are stored separately per store in browser storage. Menu products, prices, variants, modifiers, combos, stock and item schedules now come from the menu database. Payments and completed order storage remain demos; see MENU-DATABASE.md. Admin login uses the database admin record and does not require a store setting. Admin email addresses must be unambiguous across admin records. To seed the initial admin before adding stores, run `npm run db:seed:admin -- <code>` with its store/company code.

Website branding setup, API contracts, migration status and verification: [BRANDING-MODULE.md](BRANDING-MODULE.md).

Menu database implementation and setup: [MENU-DATABASE.md](MENU-DATABASE.md).

Super Admin menu creation controls are under **Admin > Stores > Edit > POS API Integration**.
When POS API is enabled, Super Admin can independently select **Show** or **Hide**
for each menu section. Hidden sections disappear from menu navigation, screens,
and matching item/combo editor tabs for both Admin and Super Admin. Direct screen
links cannot display them. Settings save automatically per store. Hidden creation
actions are also blocked in direct, batch, and nested menu API writes; POS sync
continues to work. Turning POS API off restores manual creation without clearing
the saved choices. Existing role and record editing restrictions still apply.

Apply schema changes with `npm run db:migrate:deploy` and regenerate the client
with `npm run db:generate`. Assign an existing account with
`npm run db:admin:role -- admin123@gmail.com super_admin`. The command preserves
the password and refuses ambiguous emails. Other accounts default to `admin`.
Admins can open **Admin > Team** to create individual Admin logins. They see only
Admin accounts, and cannot view or create Super Admin accounts. Super Admins can
view all team accounts and create either role. New members inherit
the creator's company scope and sign in at `/admin/login`. Emails must be unique
across admin accounts, and passwords must contain 8–128 characters.
For a new initial account, `npm run db:seed:admin -- <code> --super-admin` can
seed the Super Admin role. Run permission checks with `npm run test:menu:permissions`.
