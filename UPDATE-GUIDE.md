# Copy this update into your last simple project

## Gujarati steps

1. Tamara existing `online-ordering-web` project ni backup copy rakho.
2. Aa ZIP extract karo.
3. ZIP ma rahela `app`, `components`, `data`, `lib`, `public` folders ane `START-HERE.md` copy karo.
4. Existing `online-ordering-web` folder ma paste karo. Aa folder ma `package.json` dekhatu hovu joie.
5. Windows puche tyare **Replace files in the destination** select karo. Folders merge karvana chhe; juna folders delete nathi karvana.
6. VS Code terminal ma chalto server bandh karva Ctrl+C, pachhi `npm run dev` chalavo.
7. Home page par product nu Add button click kari navo flow try karo.

No new dependency: package.json, package-lock.json, Vite, Cloudflare and TypeScript config are not included or changed.
This is an UPDATE ZIP, not a standalone new project. Use your last `online-ordering-web-simple.zip` project as the base.

## Screen flow

Home → Product customization modal → Cart → Pickup / Delivery & Scheduling → Contact / Delivery Address → Payment → Confirmation → Tracking.

- Product Add opens customization. Select size/extras and add to cart.
- Header Cart opens the cart screen. Adjust quantities, remove items or empty cart.
- Promo demo code: SPICE10 (10% off items, excluding delivery fee).
- Continue to scheduling. Choose pickup or delivery, ASAP or a future slot.
- Complete contact details. Delivery additionally requires an address.
- Select a payment method and click Simulate Payment / Place Demo Order.
- Open Track Order and use Preview next status to inspect each stage.

## Demo boundaries

Payment is simulated. No card/UPI details are collected, no money is charged and no order is sent to a restaurant. Orders and customer details exist only in this browser tab's session storage; there is no database. Closing the tab ends that session. The preview status resets to Order Placed on reload.

The order API validates products/options/quantities and recalculates prices from temporary server data. Tracking stages are manually advanced demo states, not live notifications. The map is a clearly labelled illustration; Google Maps opens the entered address when clicked. Scheduling uses the timezone configured in data/home.ts (America/Los_Angeles in this demo), not the computer timezone. Real payments, restaurant order storage/status APIs, inventory, tax calculation and live geolocation remain future integrations.

The reference checkout mockup uses INR while the existing store uses USD. This update consistently uses the existing store currency setting; change currency/locale and product prices together in data/home.ts for another store.

Food/store images are temporary reference extracts. Replace with store assets before production.

## Files added / updated

Updated: app/layout.tsx, app/page.tsx, components/Header.tsx, data/home.ts, START-HERE.md.
Added routes: /cart, /pickup, /checkout, /checkout/payment, /order-confirmed, /track-order, POST /api/orders.
Added components: StoreProvider, ProductModal, OrderSummary, OrderDetails, MapPreview.
Added shared order types/calculation helpers: lib/order.ts.
Added images: naan.jpg, samosas.jpg, lassi.jpg, store.jpg, wrap-detail.jpg.

Existing HeroBanner, OrderControls, CategoryNav, ProductCard, Footer, /api/home and Tailwind configuration continue to be used. Old components/Cart.tsx is no longer imported; it can remain without affecting the app.
