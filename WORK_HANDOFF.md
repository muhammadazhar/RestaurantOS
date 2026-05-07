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

### Refund Pending Filter, Summary Card, And Refund History

Completed in this session:

- Extended `GET /orders` filtering so the UI can query by:
  - `payment_status`
  - `refund_status`
- Orders screen now includes a dedicated refund filter with options for:
  - pending refunds
  - manual refund required
  - refund pending
  - refund failed
  - refunded
  - no refund
- Orders screen now includes a quick `Refund Pending` filter chip similar to `Needs Review`.
- Orders screen now shows a top summary card for:
  - pending refund count
  - pending refund total value
- Added separate finance/admin refund history screen:
  - route: `/refund-history`
  - navigation: `Reports -> Refund History`
  - visible to settings/admin-level users
  - shows refund records, refund status, refund amount, timeline, reason, required action, and refund reference
  - includes filters for date, refund status, order type, and search

### Prepaid Online Order Cancellation Visibility

Completed in this session:

- Fixed the online refund/cancellation action visibility for prepaid online orders.
- `Cancel Online Order` now remains available when an eligible online order has status `paid`, so admin can still move it into the refund workflow when delivery/action has not been completed.
- Backend cancellation rule was updated to match the frontend so the button and API follow the same allowed-status rule.

### Refund Permission In Settings UI

Completed in this session:

- Added a dedicated `Refund Management` permission in `Settings -> Roles & Permissions`.
- Refund actions in `POS / Orders` no longer require full `settings` access only.
- Users with either:
  - `settings`, or
  - `refunds`
  can now:
  - cancel eligible online orders into the refund workflow
  - mark manual refunds as completed

### System Roles Can Now Be Edited

Completed in this session:

- Removed the read-only restriction on built-in system roles in `Settings -> Roles & Permissions`.
- Backend role update endpoint now allows permission updates for system roles as well as custom roles.
- Settings UI messaging now explains that built-in roles can be edited for the current restaurant.

### Served Plus Paid Online Orders Can Be Cancelled

Completed in this session:

- Fixed online refund action visibility for orders whose lifecycle status is still `served` while payment status is already `paid`.
- `Cancel Online Order` now appears for eligible online orders in status `served` as well.
- Backend online-cancellation rule now matches the frontend and accepts `served` for this workflow.

### Online Cancel SQL Type Fix

Completed in this session:

- Fixed PostgreSQL parameter type ambiguity in the online cancellation refund update query.
- Explicit casts are now used for:
  - `payment_status`
  - `refund_status`
  - `refund_amount`
  - `refund_reason`
  - `refund_required_action`
  - `refund_gateway_provider`
- This resolves the runtime error:
  - `inconsistent types deduced for parameter $5`

### Subscription Renewal After Expired Trial

Completed in this session:

- Fixed subscription renewal logic so expired `trial` / `active` rows no longer block new renewal requests.
- Added automatic normalization of stale subscription rows:
  - any `trial` or `active` subscription whose `expires_at` is already past is now updated to `expired`
- Applied this normalization in:
  - `getMySubscriptions`
  - `requestSubscription`
  - `checkModuleAccess`
- Updated renewal blocker query so only these count as blocking:
  - `pending_payment`
  - still-active `trial`
  - still-active `active`
- Verified live data for restaurant `Shahi Rasoi`:
  - the expired base trial ending on `2026-04-28` was stale in DB
  - after normalization it no longer blocks renewal

### Renewal Request False Error After Success

Completed in this session:

- Fixed backend subscription request flow to import `getConfig` correctly before sending admin renewal notifications.
- This resolves the case where the first renewal request inserted a pending subscription but then threw a server error afterward.
- Updated the license-expired frontend gate so `refreshModules()` is best-effort after a successful request.
- Result:
  - successful renewal requests now keep the success message
  - the user will not see a false generic failure after the pending request has already been created

### Login Password Toggle And Compact POS Layout

Completed in this session:

- Added a `Show` / `Hide` password toggle on the employee login screen so users can verify the password before submitting.
- Tightened the POS screen layout so the menu occupies less space and the cart remains easier to see:
  - reduced category rail width and spacing
  - reduced menu card height, image height, padding, and variant button size
- reduced the menu grid minimum card width so more items fit on the screen
- slightly widened the order/cart panel to keep cart content readable with the denser menu layout
- Keep this denser POS treatment as the default direction for future POS UI changes unless the user asks for a larger layout again.

### Railway Build Root Guard And Shared Deploy Scripts

Completed in this session:

- Simplified Railway deployment so the root `package.json` owns the install/build/start flow.
- Root `postinstall` now installs backend and frontend dependencies with `--legacy-peer-deps`.
- Root `build` / `railway:build` now builds the frontend from repository root.
- Root `start` / `railway:start` now starts `backend/src/index.js` directly without reinstalling at boot.
- Updated root `railway.json` and `nixpacks.toml` to use the shared root scripts instead of repeating nested install/build commands.
- Added a clear Railway build guard message for the failure case where Railway is pointed at the wrong root directory and cannot see both `/backend` and `/frontend`.
- If Railway still reports missing `/backend` after this push, check the Railway service `Root Directory` setting and keep it at repository root / blank.

### Railway Split-Service Correction

Completed in this session:

- Confirmed the app is deployed as split Railway services, with frontend and backend using their own folder roots.
- Removed the root-level `railway.json` and root-level `nixpacks.toml` because those overrides were forcing single-service root deployment behavior and breaking the frontend service at `/frontend`.
- Reverted the temporary root package deploy scripts that were added for single-service Railway deployment.
- Keep Railway deployment aligned like this:
  - frontend service -> root directory `/frontend`
  - backend service -> root directory `/backend`
  - each service uses its own local `nixpacks.toml`
- If frontend Railway settings still show custom root-level build/start commands, use the frontend-local ones only:
  - build: `npm install && npm run build`
  - start: `node server.js`

### POS Menu Grid Set To Three Columns

Completed in this session:

- Adjusted the POS menu grid to show items in a fixed three-column layout instead of expanding to many narrow columns.
- This keeps more consistent space available for the cart panel and makes the POS screen easier to use during ordering.

### POS Menu Cards Further Compacted

Completed in this session:

- Further reduced category rail width and menu-card spacing in POS.
- Reduced item image height, card padding, title size, and variant button size so three-column menu cards stay compact.
- Increased the cart panel width slightly so the recovered space is actually visible on the right side.

### POS Cards Balanced And Cart Widened

Completed in this session:

- Updated POS menu tiles to use a more square, balanced card proportion instead of wide horizontal cards.
- Reduced category rail width again so more usable width is handed to the main POS area.
- Increased the cart panel width further so the right-side order area is visibly larger, not just slightly adjusted.

### POS Grid Gaps Reduced And Cart Expanded Again

Completed in this session:

- Reduced horizontal spacing around the POS layout and between menu-item columns.
- Forced menu cards to fully stretch within each of the three columns so no dead horizontal gutter remains between tiles.
- Reduced category rail width again and increased cart column width again so the order panel gains more real space.

### POS Fixed Compact Tiles With Larger Text

Completed in this session:

- Changed POS menu tiles to fixed compact widths instead of letting three columns stretch wider across available space.
- Kept tiles square so height and width stay visually balanced.
- Increased item title, price, and variant button text sizing again for readability after the compact tile change.
- Increased the cart column width further so the menu no longer reclaims the extra space when the right panel is widened.

### POS Cart Aligned With Item Grid And Taller Item Cards

Completed in this session:

- Dropped the POS cart column down so it starts alongside the item grid instead of starting beside the top control bar.
- Increased the cart column width again so the right-side order area makes better use of the previously empty upper-right space.
- Increased menu-card height while keeping compact card width so prices and variant rows stay visible.
- Increased item title and price text slightly again to improve readability inside the compact card layout.

### POS Empty Menu Lane Shifted Into Cart Width

Completed in this session:

- Reduced the category rail and fixed menu-tile width slightly again so the wide blank lane beside the three-column menu is reclaimed.
- Increased the cart column width substantially again so that previously unused menu-side whitespace is now handed to the order/cart area.
- Kept the cart top aligned with the category/menu block while widening the right panel.

### POS Cart Realigned To Panel Top Instead Of Search Row

Completed in this session:

- Increased the cart column top offset so the cart now aligns with the top of the categories/menu panel instead of visually starting near the search row.
- This keeps the cart and menu panels on the same horizontal start line and better reflects the user's marked alignment reference.

### POS Menu Expanded To Four Columns And Table Selector Moved Into Cart

Completed in this session:

- Changed the POS menu grid from three columns to four compact columns so the empty lane in the menu area is used by actual items.
- Moved the dine-in `Select Table` dropdown out of the top bar and into the cart panel above the `Waiter` selector.
- Left-aligned the menu search field in the top bar after removing the table selector from that row.

### POS Menu Expanded To Five Compact Columns

Completed in this session:

- Increased the POS menu grid again from four columns to five compact columns so the remaining empty menu-side gap is filled with items.
- Reduced tile width, image height, and internal spacing carefully to fit the fifth column while keeping titles, prices, and variant actions visible.

### POS Menu Grid Switched To Auto-Fit Columns

Completed in this session:

- Replaced the fixed menu-column count with an auto-fit `minmax(...)` grid so the POS menu automatically fills available width instead of leaving a fixed empty lane.
- Allowed item cards to stretch to the width of each generated grid slot rather than staying locked to a hardcoded tile width.

### POS Menu Tiles Slightly Widened With Larger Text

Completed in this session:

- Increased the auto-fit menu tile minimum width slightly so cards feel less cramped while still filling the row automatically.
- Increased item title, price, prep-time, and variant text sizing to match the slightly wider tile layout.

### POS Menu Tiles Widened Again For Full Variant Labels

Completed in this session:

- Increased the auto-fit menu tile minimum width again so short labels like `Regular` can remain fully visible without shrinking the cart area.
- Adjusted the variant action row to a `minmax(0,1fr) auto` layout so the label and price share space more predictably inside each tile.
- Increased item card height, image height, and main text sizing slightly again to match the wider tile footprint.

### POS Menu Tiles Widened Further To Reduce Variant Truncation

Completed in this session:

- Increased the auto-fit tile minimum width again so the menu grid can drop another column when needed instead of truncating variant text.
- Increased variant button padding and font sizing slightly again to match the wider tiles while keeping the cart width unchanged.

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

## Latest Completed Change

- Added restaurant-level POS workflow settings so setup and settings can control:
  - kitchen workflow on/off
  - require table selection for dine-in
  - require waiter selection for dine-in
  - enabled order modes: dine-in, takeaway, delivery, online
- Added backend workflow normalization and persistence in:
  - `backend/src/utils/workflowSettings.js`
  - `backend/src/controllers/combinedControllers.js`
- `GET /menu` and restaurant settings now return normalized `workflow_settings`.
- Setup Wizard now includes a `POS Workflow` step and saves workflow choices during onboarding.
- Settings now include a `POS Workflow` screen for later changes.
- POS now follows workflow settings by:
  - hiding disabled order modes
  - hiding table/waiter selectors when not required
  - validating table/waiter only when enabled
  - using workflow-based initial order status
  - skipping KOT printing and changing button/success text when kitchen workflow is disabled
- Orders screen now advances order status using workflow-based next-step logic.
- Sidebar hides `Kitchen Display` when kitchen workflow is disabled.

Verification run for this change:

```powershell
node --check backend/src/controllers/ordersController.js
node --check backend/src/controllers/combinedControllers.js
npm run build --prefix frontend
```

Build passed with the same existing warnings.

## Latest Completed Change

- Tightened the new top navigation and child submenu layout:
  - smaller top module cards
  - smaller module icons/text
  - smaller active child panel
  - smaller child navigation chips
- Adjusted POS cart column top alignment so `Order - Dine In` sits closer to the categories/menu panel line instead of starting too low.
- Files changed:
  - `frontend/src/components/shared/Layout.js`
  - `frontend/src/components/pos/POS.js`

Verification run for this change:

```powershell
npm run build --prefix frontend
```

Build passed with the same existing warnings.

## Latest Completed Change

- Replaced the old left sidebar with a new premium top-navigation shell inspired by the provided reference design.
- Main menu now uses:
  - rounded horizontal module rail
  - custom outline icons
  - amber active-state card
  - secondary rounded sub-navigation panel under the active module
  - active screen chip on the right
- Dark mode uses deep charcoal / blue-black panels with amber highlight.
- Light mode keeps the same structure with bright panels and the same amber active accent.
- Existing permissions, module visibility, badge counts, review links, and workflow-based KDS hiding were preserved.
- File changed for this redesign:
  - `frontend/src/components/shared/Layout.js`

Verification run for this change:

```powershell
npm run build --prefix frontend
node --check backend/src/controllers/ordersController.js
node --check backend/src/controllers/combinedControllers.js
```

Build passed with the same existing warnings.

## Latest Completed Change

- Added admin control for employee Active / In-Active status in `Staff -> Staff Directory`.
- Employee cards now only show the current `active` / `inactive` status badge.
- Employee status changes are now handled only inside the employee edit modal through a toggle-style `Active` / `In-Active` control.
- Staff directory now separates employees into:
  - `On Duty` (active employees with active shift)
  - `Off Duty` (active employees without an active shift)
  - `In-Active` (deactivated employees)
- Staff summary cards now show counts for:
  - total staff
  - active
  - in-active
  - on duty
  - off duty

Verification run for this change:

```powershell
npm run build --prefix frontend
```

Build passed with the same existing warnings.

## Latest Completed Change

- Replaced the oversized top navigation with a more compact modern shell in `frontend/src/components/shared/Layout.js`.
- New layout uses:
  - a slim left-side module rail with icon-first navigation
  - compact badge counters on module icons
  - a much smaller contextual submenu strip above page content
  - compact theme and user controls inside the rail
- Preserved existing behavior for:
  - permissions
  - module visibility
  - badge counts
  - review links
  - kitchen workflow-based `Kitchen Display` hiding
- Goal of this redesign:
  - reduce menu footprint
  - free up more working space for app screens
  - keep a cleaner, more modern UI than the previous large top menu

Verification run for this change:

```powershell
npm run build --prefix frontend
```

Build passed with the same existing warnings.

## Latest Completed Change

- Improved visibility of `Shift Management` inside the compact navigation.
- Within the `Shifts` submenu, the `Shift Management` chip now has a subtle persistent emphasis so users can find the screen that contains the open/close shift workflow more easily.
- This does not change routes or screen behavior; it is a visibility polish only.

Verification run for this change:

```powershell
npm run build --prefix frontend
```

Build passed with the same existing warnings.

## Latest Completed Change

- Increased POS cart typography in `frontend/src/components/pos/POS.js` for better readability.
- Adjusted cart panel text sizing for:
  - guest and waiter labels
  - empty-cart state
  - cart item names and secondary text
  - open-price input text
  - quantity display
  - subtotal, discount, tax, and total lines
- Kept the compact POS layout intact while making the cart easier to read during ordering.

Verification run for this change:

```powershell
npm run build --prefix frontend
```

Build passed with the same existing warnings.

## Latest Completed Change

- Restricted super admin (`SaaS`) navigation in `frontend/src/components/shared/Layout.js`.
- Super admin no longer sees restaurant-operational menu groups such as:
  - dashboard
  - POS
  - shifts
  - tables
  - kitchen
  - staff
  - delivery
  - reports
  - finance
  - restaurant support
- Added a dedicated `SaaS` group for super admin with platform-level items only, focused on:
  - registered sites
  - company groups
  - subscription and module management
  - admin panel
  - admin support
- Kept the normal restaurant `Settings` group available only for non-super-admin restaurant users.

Verification run for this change:

```powershell
npm run build --prefix frontend
```

Build passed with the same existing warnings.

## Latest Completed Change

- Started the local-server offline mode foundation.
- Confirmed local Docker PostgreSQL schema on port `5432` now matches Neon for tables, columns, and indexes.
- Added backend offline runtime config in `backend/src/utils/offlineConfig.js`:
  - `DEPLOYMENT_MODE=local_offline`
  - `DEVICE_ID`
  - `BRANCH_CODE`
  - `CLOUD_API_URL`
- Added idempotent offline sync schema bootstrap in `backend/src/utils/offlineSync.js`:
  - `offline_devices`
  - `offline_sync_queue`
  - sync metadata columns/indexes on core offline write tables.
- Backend startup now runs the offline sync schema bootstrap after DB connection.
- Added sync API endpoints:
  - `GET /api/sync/status`
  - `POST /api/sync/retry`
- Added frontend API wrappers for sync status/retry.
- Added compact sync/offline status indicator in the shared layout:
  - `Online`
  - `Offline - local mode`
  - `Local mode online`
  - `Pending sync N`
  - `Sync issues N`

Verification run for this change:

```powershell
node --check backend/src/utils/offlineConfig.js
node --check backend/src/utils/offlineSync.js
node --check backend/src/controllers/syncController.js
node --check backend/src/index.js
node --check backend/src/routes/index.js
npm run build --prefix frontend
```

Build passed with the same existing warnings.

Important next offline-mode work:

- Add queue writes around POS order creation/status/payment/returns.
- Add real cloud push worker for pending queue items.
- Add cloud pull for menu/settings/tables/employees.
- Add local-server deployment env example and startup instructions.

## Latest Completed Change

- Added a local Docker runtime for testing RestaurantOS against the local Docker PostgreSQL DB:
  - `.dockerignore`
  - `Dockerfile.local`
  - `docker-compose.local.yml`
- The local app container:
  - builds the React frontend inside Docker
  - serves the frontend from the backend in production mode
  - runs backend on internal port `5001`
  - maps host port `5051` to avoid conflict with the existing local backend port
  - connects to local PostgreSQL through `host.docker.internal:5432`
  - runs with `DEPLOYMENT_MODE=local_offline` and `DB_MODE=local`
  - reads Cloudinary credentials from local `backend/.env` through Compose `env_file`
  - mounts `./backend/uploads` into the container
- Moved public `GET /api/health` before authenticated API routes so Docker/local health checks can use it without a token.
- Local Docker app was started successfully:
  - URL: `http://localhost:5051`
  - container: `restaurantos-local`
  - DB mode endpoint confirmed local mode

Verification run for this change:

```powershell
docker compose -f docker-compose.local.yml build restaurantos-local
docker compose -f docker-compose.local.yml up -d --force-recreate
Invoke-RestMethod -Uri 'http://localhost:5051/api/health'
Invoke-RestMethod -Uri 'http://localhost:5051/api/db-info'
Invoke-WebRequest -Uri 'http://localhost:5051/' -UseBasicParsing
node --check backend/src/index.js
```

Build passed with the same existing frontend warnings.

How to run local Docker app:

```powershell
docker compose -f docker-compose.local.yml up -d --build
```

How to stop it:

```powershell
docker compose -f docker-compose.local.yml down
```

## Latest Completed Change

- Mirrored all Neon table data into the local Docker PostgreSQL database.
- Stopped `restaurantos-local` before copying data so the app would not write during the mirror.
- Created local backup schema before replacing local data:
  - `backup_before_neon_sync_20260506144608`
- Copied all common public tables from Neon to local:
  - tables copied: `58`
  - rows copied: `1461`
- Reset matching local sequences from Neon:
  - `order_adjustment_number_seq`
  - `plant_care_log_id_seq`
- Restarted the local Docker app after the mirror.
- Verified local and Neon row counts match exactly:
  - Neon total rows: `1461`
  - local total rows: `1461`
  - differing table counts: `0`
- Verified local app endpoints after restart:
  - `http://localhost:5051/api/health`
  - `http://localhost:5051/api/db-info`
- Local Docker app remains available at:
  - `http://localhost:5051`

Important note:

- Data is now matched from Neon to local, but offline-created POS writes still need queue/push logic before they can sync back to Neon.

## Latest Completed Change

- Added first real offline POS sync loop.
- POS/order mutations now queue a full order snapshot into `offline_sync_queue` when running in `DEPLOYMENT_MODE=local_offline`:
  - `POST /orders`
  - `POST /orders/:id/items`
  - `PATCH /orders/:id/status`
  - `POST /orders/:id/replace-item`
  - `POST /orders/:id/return-item`
  - `POST /orders/:id/cancel-return`
- Queue behavior:
  - One pending queue item per order using stable idempotency key `order:<orderId>`.
  - Later mutations on the same order update the queued snapshot instead of creating duplicate pending rows.
  - `orders.sync_status` is marked `pending`, then `synced`, `failed`, or `conflict`.
- Added background sync worker:
  - starts only in local offline mode
  - requires `CLOUD_API_URL`
  - requires `CLOUD_SYNC_TOKEN`
  - pushes pending/failed queue items to cloud endpoint `/api/sync/ingest`
  - marks queue rows `synced` when cloud accepts the snapshot
- Added cloud ingest endpoint:
  - `POST /api/sync/ingest`
  - protected by `X-RestaurantOS-Sync-Token`
  - applies `order_snapshot` payloads idempotently by upserting:
    - `orders`
    - `order_items`
    - `order_adjustments`
    - `order_adjustment_items`
    - dining table status
- Updated `POST /api/sync/retry` to mark failed items pending and kick the worker.
- Added offline sync env notes to `backend/.env.example`.
- Added `CLOUD_SYNC_TOKEN` to `docker-compose.local.yml`.

Required env for live local-to-cloud sync:

```powershell
CLOUD_API_URL=https://your-railway-backend-url
CLOUD_SYNC_TOKEN=<same-long-random-token-on-local-and-railway>
```

Verification run for this change:

```powershell
node --check backend/src/utils/offlineConfig.js
node --check backend/src/utils/offlineSync.js
node --check backend/src/controllers/syncController.js
node --check backend/src/controllers/ordersController.js
node --check backend/src/routes/index.js
node --check backend/src/index.js
docker compose -f docker-compose.local.yml build restaurantos-local
docker compose -f docker-compose.local.yml up -d --force-recreate
Invoke-RestMethod -Uri 'http://localhost:5051/api/health'
```

Local queue smoke test:

- Created a temporary pending `order_snapshot` queue row for an existing local order.
- Confirmed `GET /api/sync/status` style queue summary saw `pending: 1`.
- Removed the temporary queue row and reset the test order sync status.

Important follow-up:

- Set `CLOUD_SYNC_TOKEN` on Railway and local Docker before testing live push.
- Set `CLOUD_API_URL` locally to the Railway backend URL.
- After setting those, local status should move from `Offline - local mode` to `Local mode online`; creating/updating a POS order should briefly show `Pending sync 1`, then clear when pushed.

## Latest Completed Change

- Added master-data offline sync for local-server mode.
- Local admin/master-data edits now queue `master_data_snapshot` items into `offline_sync_queue` for:
  - restaurant settings/logo
  - dining tables
  - categories
  - menu items, variants, add-on groups, and add-ons
  - employees
  - roles
  - discount presets
  - inventory items and stock quantity changes
  - recipes and recipe ingredients
- Cloud ingest endpoint now accepts both:
  - `order_snapshot`
  - `master_data_snapshot`
- Added protected cloud-to-local master-data pull endpoint:
  - `POST /api/sync/master-data`
  - protected by `X-RestaurantOS-Sync-Token`
  - returns full master-data snapshots for the requested restaurant IDs.
- Local sync worker now:
  - pushes pending queue items to Railway/Neon
  - pulls cloud master data back down every `MASTER_SYNC_PULL_INTERVAL_MS` milliseconds, default `60000`
  - skips applying a cloud master-data row when the same local row has a pending/failed/conflict local edit.
- Added sync metadata columns to master-data tables through the existing offline schema bootstrap.
- Added `MASTER_SYNC_PULL_INTERVAL_MS` to `backend/.env.example`.

Verification run for this change:

```powershell
node --check backend/src/utils/masterDataSync.js
node --check backend/src/utils/offlineSync.js
node --check backend/src/controllers/syncController.js
node --check backend/src/controllers/combinedControllers.js
node --check backend/src/controllers/inventoryController.js
node --check backend/src/routes/index.js
docker compose -f docker-compose.local.yml build restaurantos-local
docker compose -f docker-compose.local.yml up -d --force-recreate
Invoke-RestMethod -Uri 'http://localhost:5051/api/health'
Invoke-RestMethod -Uri 'http://localhost:5051/api/db-info'
```

Smoke tests:

- Built a full master-data pull snapshot from local Docker PostgreSQL for one restaurant:
  - restaurants: `1`
  - snapshots: `186`
- Queued and cleaned up a temporary category `master_data_snapshot` queue item:
  - entity_type: `category`
  - operation: `update`
  - status: `pending`

Important note:

- Live cloud-to-local master-data pull will start only after local Docker has `CLOUD_API_URL` and matching `CLOUD_SYNC_TOKEN`; the current local container correctly logs idle while `CLOUD_API_URL` is empty.

## Latest Completed Change

- Tightened master-data conflict policy so local-server offline mode treats master setup data as cloud-managed and read-only.
- When `DEPLOYMENT_MODE=local_offline`, the backend now rejects local add/edit/delete actions with HTTP `409` for:
  - dining table setup
  - employee setup
  - menu item setup, image changes, variants, and add-ons
  - category setup
  - recipe setup
  - role/permission setup
  - restaurant settings/logo
  - discount presets
  - inventory item setup
- Cloud-to-local master-data pull remains enabled, so changes made in Railway/Neon still sync down to the local server.
- Inventory stock movements remain local operational activity; only inventory item definition/setup is blocked locally.

Verification run for this change:

```powershell
node --check backend/src/controllers/combinedControllers.js
node --check backend/src/controllers/inventoryController.js
docker compose -f docker-compose.local.yml build restaurantos-local
docker compose -f docker-compose.local.yml up -d --force-recreate
Invoke-RestMethod -Uri 'http://localhost:5051/api/health'
```

Smoke test:

- With `DEPLOYMENT_MODE=local_offline`, mocked local `createCategory` and `createItem` calls both returned HTTP `409` before any DB write.

## Latest Completed Change

- Configured the local Docker offline runtime with the Railway backend API URL:
  - `https://restaurantos-production-bdb7.up.railway.app`
- Confirmed Railway backend health endpoint is reachable:
  - `GET /api/health` returned `status: ok`
- Local Docker now defaults `CLOUD_API_URL` to that Railway backend URL unless overridden by the host environment.

Important note:

- `CLOUD_SYNC_TOKEN` still must be set to the same value in both Railway backend variables and local Docker before protected sync push/pull can run.

## Latest Completed Change

- Added local offline menu image localization.
- New utility:
  - `backend/src/utils/offlineImageCache.js`
- In `DEPLOYMENT_MODE=local_offline`, the backend now:
  - downloads remote `menu_items.image_url` values into `backend/uploads/offline-cache`
  - rewrites only the local DB `menu_items.image_url` to `/uploads/offline-cache/...`
  - leaves cloud/Neon image URLs unchanged
  - reruns localization after cloud-to-local master-data pull
  - runs localization once on local server startup
- Added env documentation for:
  - `OFFLINE_IMAGE_CACHE_LIMIT`
  - `OFFLINE_IMAGE_FETCH_TIMEOUT_MS`

Verification run for this change:

```powershell
node --check backend/src/utils/offlineImageCache.js
node --check backend/src/utils/masterDataSync.js
node --check backend/src/index.js
docker compose -f docker-compose.local.yml up -d --build --force-recreate
```

Local image localization result:

- Before:
  - total menu items: `99`
  - remote image URLs: `80`
  - local upload images: `1`
  - no images: `18`
- Localization run:
  - checked: `80`
  - localized: `80`
  - failed: `0`
- After:
  - remote image URLs: `0`
  - offline cached images: `80`
  - other local upload images: `1`
  - no images: `18`
- Confirmed local Docker serves cached menu image URLs with HTTP `200` from:
  - `http://localhost:5051/uploads/offline-cache/...`

Important note:

- Downloaded image files in `backend/uploads/offline-cache` are local runtime data and were not staged for Git.

## Latest Completed Change

- Improved POS order sync timing.
- `queueOrderSnapshot` now triggers an immediate background `processPendingQueue()` when local offline mode has both:
  - `CLOUD_API_URL`
  - `CLOUD_SYNC_TOKEN`
- The periodic worker remains as a backup and still defaults to:
  - `SYNC_WORKER_INTERVAL_MS=15000`
- Added env example notes clarifying immediate order push and worker interval.

Current local runtime observation:

- Local Docker has:
  - `CLOUD_API_URL=https://restaurantos-production-bdb7.up.railway.app`
  - `DEPLOYMENT_MODE=local_offline`
  - empty `CLOUD_SYNC_TOKEN`
- Because `CLOUD_SYNC_TOKEN` is empty, the sync worker does not start yet and queue items remain pending until the same token is configured in Railway and local Docker.
