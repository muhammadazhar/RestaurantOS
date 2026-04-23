# RestaurantOS Work Handoff

Saved on: 2026-04-23

This file is only a memory note for resuming work. It should not affect the app, deployment, or build.

## Working Directory

`D:\System\Systems\Web Projects\Codex\restaurantos`

## Current Collaboration Rule

The user wants every completed code change pushed to Git so Railway deploys it.

After each completed change:

1. Run the relevant checks.
2. Stage only the touched source files.
3. Commit with a clear message.
4. Push to `origin main`.

Do not stage local-only files unless explicitly requested:

- `.gitignore`
- `backend/.env`
- `frontend/.env`

## Recent Work And Status

### Database And Deployment

- Switched app config toward NEON DB usage.
- Railway variables were reviewed from screenshot; app eventually worked after Railway was calling NEON.
- Cloudinary was configured as the image storage source for both dev/prod.
- Several changes were pushed to `origin/main`; Railway pipeline should deploy from Git.

### POS Shift, Tax, And Table Fixes

- Fixed "Please start your shift before placing orders" / shift handling in POS.
- Later fixed shift-opening time checks to use the restaurant timezone.
- Tax logic was updated so item-level tax flags and global tax settings affect POS/orders, sales, and invoices.
- Table management dark/light mode was improved.
- Occupied tables are visually marked.
- Added table setup button in Table Management for users who skipped table setup during restaurant setup.
- Added edit/delete options in Table Management.

### Menu Management

- Added Edit/Delete controls for categories with icons/tooltips.
- Prevented category deletion when it has child menu items or sold items; category can be made inactive instead.
- Prevented menu item deletion when used in sales.
- Removed category controls from the top panel in Menu Management.
- Moved POS/Orders categories to the left side without edit/delete options.

### Receipt And KOT Printing

- Improved POS-printer output clarity for KOT/payment receipt.
- Added a receipt/KOT print designer saved at restaurant settings/setup level.
- Designer supports header/footer content, logo/settings, fields, and defaults based on current printing.
- Printing now uses saved templates.
- Commit pushed: `3439fae2 Add receipt and KOT print designer`.

### Order Return Workflow

- Implemented POS/Orders return process based on attached `restaurant_order_returns.md`.
- Added backend order adjustments tables/migration logic previously.
- Added single-item return from POS cart for active occupied table orders.
- Fixed this error by using valid table status `vacant` instead of `available`:

```text
new row for relation "dining_tables" violates check constraint "dining_tables_status_check"
```

- Commit pushed: `56cffa01 Add single item returns in POS`.

### Add Items After Return / Existing Order

User reported that after returning one item, adding another item to an existing order showed:

```text
Select Replace on the current order item first
```

Fixed POS so an active loaded table order supports:

- Return existing item.
- Replace existing item.
- Add new item to same order.

Other details:

- Added backend endpoint `POST /orders/:id/items`.
- KOT prints only newly added items for existing orders.
- Commit pushed: `225a069d Allow adding items to active POS orders`.

### Returned Item Display And Reports

User reported returned item still showed normally in Table Management -> View Bill.

Fixed bill so returned items are visible but not charged:

- Marked `Returned - not charged`.
- Red/struck styling.
- Line total showed `0`.

Printed receipt also marks returned items.

Sales/menu reports now include returned quantity/return amount.

Sold qty/revenue excludes returned/cancelled item rows.

Paid-order journal entries exclude returned/cancelled item rows.

Commit pushed: `0828c0c4 Show returned items on bills and reports`.

## Important Next Task

Latest active work items:

1. Returned items should show with value and be clearly marked, either:
   - A `returned` label, or
   - A negative sign with value.

   Current implementation shows returned line total as `0`, which the user wants changed.

   Modify bill/receipt display so returned items show their value, likely as a negative amount:

   ```text
   Returned - not charged    -PKR 500
   ```

   Keep order totals unchanged because totals already exclude returned items.

   Reports already have returned amount fields, but the UI may need clearer negative/returned display if required.

2. Open/Close Shift panel in Shift Management should show already opened or in-progress shifts that can be closed.
   - The same open/in-progress shift visibility exists in Staff -> Employees -> Shift Schedule for force close.
   - Shift Management -> Open / Close Shift should show those open/in-progress shifts in the Close Shift panel.
   - Likely fix: have `frontend/src/components/shifts/ShiftManagementMockup.js` load `getOpenShifts()` and merge those sessions into the Close Shift list, de-duplicating shifts already present in today `dayShifts`.

## Likely Files For Next Task

### `frontend/src/components/tables/TableBill.js`

- `itemChargeTotal` currently returns `0` for returned items.
- Change returned display to negative original value instead of `0`.

### `frontend/src/utils/printTemplates.js`

- `renderReceiptHtml` currently sets `lineTotal = returned ? 0 : ...`.
- Change returned receipt line to negative original value.
- Keep `RETURNED - NOT CHARGED`.

### Possible Optional File

`frontend/src/components/reports/Reports.js`

- Only touch if the user also wants returned values shown more visibly in reports.

### Shift Management File

`frontend/src/components/shifts/ShiftManagementMockup.js`

- Open/Close tab currently closes `active` derived from today `dayShifts`.
- Staff schedule uses `getOpenShifts()` for force-close visibility.
- Merge `getOpenShifts()` into the Close Shift panel so older active and in-progress sessions are visible.

## Verification To Run After Next Change

If backend is touched:

```powershell
node --check backend/src/controllers/ordersController.js
```

Always run frontend build if frontend is touched:

```powershell
npm run build --prefix frontend
```

Existing frontend build warnings from last run:

- `src/components/orders/Orders.js Line 44:3 Unreachable code`
- `src/components/tables/TableBill.js Line 116:5 Unreachable code`
- Several unused variables elsewhere.

These warnings existed before and the build succeeds.

## Current Repository State From Last Known Push

- HEAD was `0828c0c4`.
- Remaining unstaged local-only files were:
  - `.gitignore`
  - `backend/.env`
  - `frontend/.env`

Note: a later local status check also showed a lot of unrelated `node_modules`, build, cache, upload, and env noise. Do not clean or stage that unless the user explicitly asks.
