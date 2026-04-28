# RestaurantOS Work Handoff

Saved on: 2026-04-23

This file is only a memory note for resuming work. It should not affect the app, deployment, or build.

## Working Directory

`D:\System\Systems\Web Projects\Codex\restaurantos`

## Current Collaboration Rule

The user wants every completed code change pushed to Git so Railway deploys it.

After each completed change:

1. Run the relevant checks.
2. Update this `WORK_HANDOFF.md` file with any completed additions/modifications and any important follow-up notes.
3. Stage only the touched source files, including `WORK_HANDOFF.md` when it was updated.
4. Commit with a clear message.
5. Push to `origin main`.

Do not stage local-only files unless explicitly requested:

- `.gitignore`
- `backend/.env`
- `frontend/.env`

## Recent Work And Status

### Sidebar Notification Badges

Completed in this session:

- Added red bubble notification badges to the shared sidebar navigation.
- POS / Orders badge counts active unpaid transactions that need review/action from POS orders and phone orders.
- Support badge counts unresolved restaurant support tickets.
- Admin Support badge counts open support tickets awaiting review.
- Badge counts refresh on layout load, browser focus, and periodically while the app is open.

Adjustment requested later:

- POS / Orders badge should count only orders that are not completed yet.
- Support badge should count tickets that are not resolved.
- Sidebar order badge now queries incomplete order statuses directly from the API instead of loading all orders and filtering client-side.
- Orders and support screens now support a `Needs Review` filtered view, and badge-linked menu entries open those filtered views directly.

### Mobile Development Documentation

Completed in this session:

- Added `MOBILE_APP_FUNCTIONAL_SPEC.md` for mobile developers to understand the full RestaurantOS feature set already built in the web application.
- Added `MOBILE_APP_UI_SPEC.md` for mobile developers to understand the recommended mobile navigation, screen layouts, shared components, and visual rules.
- Documented the returned-item UI rule for mobile:
  - Show label `Returned - not charged`.
  - Show returned value as a negative amount, for example `-PKR 500`.
  - Apply a thin red strike-through to returned item price/value.
  - Keep order totals unchanged because returned rows are already excluded from totals.
- These files are documentation only and do not affect build/deployment behavior.

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

### Returned Item Values And Shift Close Panel

Completed and pushed:

- Commit pushed: `ce6daaca Show returned values and open shifts`.
- Returned bill items now show their returned value as a negative amount, for example `-PKR 500`, while order totals remain unchanged.
- Receipt printing now shows returned line values as negative amounts and keeps `RETURNED - NOT CHARGED`.
- Shift Management -> Open / Close Shift now loads `/shifts/open` and merges already-open/in-progress sessions into the Close Shift panel.
- Close Shift panel de-duplicates sessions already present in today's active shifts.

### Returned Item Strike-Through And Sales Return KPI

Completed and pushed:

- Commit pushed: `7ad8d130 Highlight returned item values`.
- Returned item prices/values now get a thin red strike-through treatment in:
  - Table bill.
  - Printed receipt template.
  - Orders detail modal.
  - Sales report returned values.
  - Menu performance returned values.
- Sales Report now shows a top KPI card for `Returned Value` next to:
  - `Total Revenue`
  - `Paid Orders`
  - `Avg Order Value`
  - `Total Guests`
- Sales and Menu print reports also show returned values with the red strike-through treatment.

### Login Reliability

Completed in this session:

- Investigated a login failure affecting multiple users even with correct passwords.
- Confirmed active employees, role links, password hashes, JWT secrets, subscriptions, and refresh token table all exist in the current database.
- Hardened employee login in `backend/src/controllers/authController.js`:
  - Login now looks up active employees by email first, then matches the entered restaurant value against either restaurant slug or branch code.
  - If an email belongs to only one active restaurant, login can still resolve that account cleanly even when the restaurant field is brittle.
  - Role lookup is now `LEFT JOIN` based so a missing role row does not block valid credentials from signing in.
  - Permissions are normalized safely to an array before returning the user payload.
  - Active module lookup is now best-effort and no longer breaks login if subscription lookup has an issue.
- Refresh token persistence is now best-effort and no longer blocks successful login if that insert fails.
- Add future auth/login changes here as well so login-related regressions are easy to trace.

### Online Order Cancellation And Refund Workflow

Completed in this session:

- Added admin-only online order cancellation workflow for incomplete online orders.
- New backend action allows cancellation for online-managed orders in statuses:
  - `pending`
  - `confirmed`
  - `preparing`
  - `ready`
  - `picked`
  - `out_for_delivery`
- Cancellation now requires a reason.
- Online cancellation creates a full cancellation adjustment audit trail using the existing `order_adjustments` and `order_adjustment_items` tables.
- Added order-level refund tracking fields on `orders`:
  - `refund_status`
  - `refund_amount`
  - `refund_reason`
  - `refund_required_action`
  - `refund_gateway_provider`
  - `refund_reference`
  - `refund_note`
  - `refund_requested_at`
  - `refunded_at`
  - `refunded_by`
  - `refund_updated_at`
- Extended order `payment_status` workflow to allow `refund_pending`.
- Because no payment gateway refund API exists yet:
  - cancelling a paid online order sets `payment_status='refund_pending'`
  - sets `refund_status='manual_refund_required'`
  - clearly marks that staff must return the amount manually outside the app
- Added future-ready gateway hook logic:
  - backend checks restaurant `settings.payment_gateway`
  - later a real gateway API can be activated from settings without redesigning the order refund flow
- Added second admin action to mark a manual refund as completed:
  - sets `payment_status='refunded'`
  - sets `refund_status='refunded'`
  - stores optional refund reference and note
- Orders UI now shows:
  - `Cancel Online Order` action
  - `Mark Refund Complete` action
  - refund badges / refund amount / manual refund required state in order detail and list rows

## Important Next Task

No active next task is pending right now. Wait for the user's next instruction.

## Verification To Run After Next Change

If backend is touched:

```powershell
node --check backend/src/controllers/ordersController.js
```

For auth-specific backend changes, also run:

```powershell
node --check backend/src/controllers/authController.js
```

Always run frontend build if frontend is touched:

```powershell
npm run build --prefix frontend
```

Existing frontend build warnings from last run:

- `src/components/orders/Orders.js Line 51:3 Unreachable code`
- `src/components/tables/TableBill.js Line 116:5 Unreachable code`
- Several unused variables elsewhere.

These warnings existed before and the build succeeds.

## Current Repository State From Last Known Push

- HEAD was `7ad8d130`.
- Remaining unstaged local-only files were:
  - `.gitignore`
  - `backend/.env`
  - `frontend/.env`

Note: a later local status check also showed a lot of unrelated `node_modules`, build, cache, upload, and env noise. Do not clean or stage that unless the user explicitly asks.
