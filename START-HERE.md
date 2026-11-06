# Spice Table — simple Vinext ordering demo

## Run

```sh
npm install
npm run dev
```

For this update, if dependencies are already installed, just restart `npm run dev`.
Use the address printed by Vite. Build with `npm run build`.

## Workflow

1. `GET /api/home` returns temporary store, menu and ordering configuration from `data/home.ts`.
2. `components/StoreProvider.tsx` loads that data once and shares cart/checkout state across pages.
3. `app/page.tsx` displays the home page. Product Add opens ProductModal.
4. `/cart` shows selected options, quantities, recommendations, promo and totals.
5. `/pickup` chooses pickup/delivery and ASAP/scheduled time.
6. `/checkout` collects contact/address details.
7. `/checkout/payment` sends product IDs, options and contact details to `POST /api/orders`.
8. The demo route validates the request and recalculates prices using server data. It returns a demo order without storing or charging it.
9. `/order-confirmed` and `/track-order` display the saved demo order snapshot.

## Where to edit

- `data/home.ts`: branding, header/footer text, products, sizes, extras, images, delivery fee, promo, store timezone, slots and payment method labels.
- `components/`: reusable visual sections. Styling is Tailwind utility classes directly in JSX.
- `app/**/page.tsx`: each screen.
- `lib/order.ts`: shared cart/order types, money calculations and date/slot validation.
- `app/api/home/route.ts`: replace temporary home data with your real home API later.
- `app/api/orders/route.ts`: replace the demonstration response with your backend order API later.

No new package has been added. Original dependency/build configuration stays the same.

Payment and tracking are DEMO ONLY. No real charges, restaurant orders or live tracking. Read UPDATE-GUIDE.md for copy instructions and demo limitations.
