# Update for your latest online-ordering-web (2).zip

1. Back up your project.
2. Extract this UPDATE ZIP.
3. Copy the app, components and data folders into your existing online-ordering-web folder (the one containing package.json).
4. Merge folders and choose Replace files in the destination. Do not delete your existing folders.
5. Stop the running server with Ctrl+C and restart: npm run dev.

No npm install is needed if you already installed this project's dependencies. No dependency or build configuration changed.

## What was fixed

- Root layout now shares the StoreProvider across every page.
- Home page now opens product customization and uses the same cart as checkout.
- Header cart button opens /cart, keeping its existing icon and design.
- Header Menu / Our Story / Contact links point to home sections from every screen.
- Header/footer logo links return to home.
- Existing data is preserved, including your updated Biryani category image. Missing product options, ordering configuration and recommendation products were added for the existing checkout screens.

Header and Footer JSX classes, icons, dimensions, spacing, colour, layout and visible text are unchanged. Only link destinations/connection changed.

Flow: Home Add → Customize → Cart → Pickup/Delivery & Scheduling → Contact/Address → Demo Payment → Confirmation → Tracking.

Payment and tracking remain temporary demonstrations. No money is charged, no order is sent to a restaurant and tracking is not live.

This patch contains 6 changed source files only:
app/layout.tsx, app/page.tsx, components/StoreProvider.tsx, components/Header.tsx, components/Footer.tsx, data/home.ts.
All other screens, styles, images and setup files in your uploaded project are retained.
