# Customer account update

## Apply to your existing project

1. Back up your existing project.
2. Extract this ZIP. Copy the contents of `online-ordering-web` into your existing project folder and replace matching files. Keep your own deployment credentials and environment files.
3. Open a terminal in that project folder and run `npm install`, then `npm run dev`.
4. Open the address printed in the terminal. Click **Account** in the header.

Demo username: `demo`  
Demo password: `Spice123!`

The login form has only username and password. There is no signup or forgot-password flow.

## Changes

- Added `/login` and `/account` pages and `components/Account.tsx`.
- Added an Account link to the existing header. Header keeps its existing colors, logo and navigation. The right side shows the Account icon and label beside the cart, as in the reference; the header address is removed. No search icon or search box is added.
- Footer is unchanged.
- Profile editing, saved address add/edit/delete/default, and selecting an address for checkout.
- Order history from completed demo checkouts, item details, and reorder into the current cart using current menu prices.
- Demo cancellation request recording, restaurant phone link and restaurant map link.
- Updated `StoreProvider.tsx` to retain the latest 50 completed demo orders in this tab.

## Try the flow

Login → Profile → Edit → Save. Add an address, then select **Use at checkout**. Add menu items and complete the existing demo checkout. Open Account → My Orders → View details or Reorder. Refresh to verify that data survives in this tab. Logout and log in again.

## Demo scope

This extends the existing demo ordering application. Login is a visible demo credential check, not secure authentication. Account data and order history use sessionStorage in this browser tab; they do not sync across devices and disappear when the session ends. Do not enter sensitive information. Cancellation records are local demo requests. No restaurant messages, live status, refunds or payment transactions are sent. A production account system requires server authentication and a database.

`node_modules`, generated builds and environment files are omitted from the ZIP. Install dependencies locally before running.
