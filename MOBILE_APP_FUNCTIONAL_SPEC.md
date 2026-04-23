# RestaurantOS Mobile App Functional Specification

Saved on: 2026-04-23

This document describes the web application features that the mobile application should reproduce. It is written for mobile developers who need to build native or cross-platform mobile screens against the existing RestaurantOS backend.

## 1. Product Scope

RestaurantOS is a multi-tenant restaurant POS and operations system. The mobile application should support the same operational workflows currently available in the web application:

- Restaurant onboarding and setup.
- Authentication, roles, permissions, and staff access.
- POS order taking for dine-in, takeaway, delivery, and online orders.
- Active table order management, bill payment, receipt printing, KOT printing, item returns, replacements, and additions.
- Kitchen order display and order status progression.
- Dining table management, table setup, reservations, and running bills.
- Menu and category management with safe delete rules.
- Inventory, recipes, alerts, and stock movement.
- Employees, attendance, shifts, open/close shift, force close, and shift sales reporting.
- Delivery platform management, phone orders, rider assignment, rider payment collection, cashier collections, incentives, and audits.
- Sales, menu, employee, performance, shift, and GL reports.
- Restaurant settings, taxes, receipt/KOT print designer, discount presets, WhatsApp settings, subscription requests, support tickets, and system/admin tools.

## 2. Application Roles

The mobile app should be role-aware. Existing web behavior uses backend roles and permissions. Mobile should hide or disable actions that the logged-in user is not allowed to perform.

Core personas:

- Owner / Manager: full restaurant operations, reports, staff, settings, shifts, inventory, GL, menu, subscriptions, support.
- Cashier / POS user: open shift, take orders, accept payment, print receipts/KOT, manage active table orders, close own shift.
- Waiter / Server: dine-in table orders, running bill view, KOT, customer/table status.
- Kitchen user: kitchen display, order status updates from pending to preparing to ready.
- Rider: available delivery orders, claim order, pick order, navigate to customer, collect payment.
- Accountant / Admin: ledger, GL setup, GL reports, journal entries, trial balance, balance sheet.
- Platform super admin: restaurants, groups, subscriptions, support, system health, backups, system config.

## 3. Authentication And Session

Web routes:

- `/login`
- `/super-login`
- `/forgot-password`
- `/reset-password`
- `/register`

Mobile requirements:

- Login with the same backend token model used by the web app.
- Persist token securely in mobile secure storage.
- Attach token to every API request.
- Handle token expiry by sending the user back to login.
- Support restaurant-aware user context, including role, permissions, setup status, and subscription/module access.
- Support forgot/reset password screens if this mobile app is customer-facing for staff and managers.
- Super admin login can be a separate hidden/admin-only entry if needed.

Primary APIs:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/super-login`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

## 4. Setup And Onboarding

Web route: `/setup`

The setup wizard lets a new restaurant configure basic operating data:

- Welcome step.
- Dining table setup using presets or custom tables.
- Menu category setup using presets or custom categories.
- First menu items.
- Staff invitation/creation.
- Done step that marks setup complete and routes to dashboard.

Mobile requirements:

- Show setup when backend setup status says setup is incomplete.
- Allow each step to be completed or skipped where web allows skipping.
- Save tables, categories, menu items, and staff through the same APIs.
- Table presets should include small, mid-size, and large restaurant defaults.
- Category presets should include full restaurant, cafe, fast food, fine dining, and custom.
- Staff created during setup uses default password behavior from web unless backend changes it.

Primary APIs:

- `GET /setup/status`
- `POST /setup/complete`
- `GET /roles`
- `POST /employees`
- `POST /menu/items`

## 5. Dashboard

Web route: `/dashboard`

Dashboard provides high-level restaurant status and performance summaries.

Mobile requirements:

- Show KPI cards for daily/period restaurant activity.
- Show recent order status, revenue, alerts, and important operational signals.
- Refresh on app resume and when real-time events arrive.
- Keep dashboard role-aware. Cashiers and kitchen users should see operational cards, while owners/managers should see business KPIs.

Primary API:

- `GET /dashboard/stats`

## 6. POS

Web route: `/pos`

The POS is the core ordering workflow. Mobile must preserve the same business rules.

### 6.1 POS Load Data

On POS open, load:

- Menu categories and menu items.
- Dining tables.
- Online/delivery orders if used in the POS context.
- Current shift.
- Discount presets.
- Riders and employees for rider/waiter assignment.
- Restaurant settings including tax rates and print templates.

Primary APIs:

- `GET /menu`
- `GET /tables`
- `GET /orders`
- `GET /shifts/current`
- `GET /discount-presets`
- `GET /rider/riders`
- `GET /employees`
- `GET /restaurant/settings`

### 6.2 Shift Gate

POS order placement requires a valid cashier shift and attendance state.

Rules:

- If no active or in-process shift exists, show shift start/open prompt.
- Shift start can require opening balance.
- The user may need to clock in before order placement.
- Shift opening time checks use the restaurant timezone.
- If shift end is reached, show modal to continue shift or close it.
- Closing shift records cashier collection and cash summary.

Primary APIs:

- `GET /shifts/current`
- `GET /shifts/my`
- `PATCH /shifts/:id/start`
- `PATCH /shifts/:id/continue`
- `PATCH /shifts/:id/close-my`
- `GET /shifts/:id/cash-summary`
- `POST /attendance/clock-in`
- `GET /attendance/status`

### 6.3 Order Types

Supported POS order types:

- `dine_in` with table selection.
- `takeaway`.
- `delivery`.
- `online`.

Required order data can include:

- Table ID for dine-in.
- Customer name and phone.
- Delivery address and rider assignment for delivery.
- Waiter assignment.
- Order notes and item notes.
- Payment method and tendered amount.

### 6.4 Menu Selection

Mobile POS must support:

- Category browsing.
- Search by item name, description, category, or kitchen route.
- Item variants, portion pricing, weight pricing, piece pricing, and pack pricing.
- Add-on groups if returned by backend.
- Weekend price rules.
- Open price items when allowed.
- Price override only for permitted roles.
- Tax flags per item.
- Discount eligibility per item.
- Smart menu sort if enabled in settings.

### 6.5 Cart

Cart behavior:

- Add item with selected variant/price.
- Increase/decrease quantity.
- Remove item.
- Add item notes.
- Apply discount presets or manual discount.
- Calculate subtotal, discount, tax, and total.
- Support included and exclusive taxes based on item and restaurant settings.
- Show service charge if configured.
- Prevent invalid prices, invalid quantity, and unauthorized price override.

### 6.6 Active Table Orders

When a table is occupied, POS can load its active order.

Active order must support:

- Return existing item.
- Replace existing item.
- Add new item to same order.
- Cancel loaded order if allowed.
- Print KOT only for newly added items on existing orders.
- Keep returned/cancelled items visible but excluded from charged totals.

Primary APIs:

- `GET /orders/table/:tableId/active`
- `POST /orders`
- `POST /orders/:id/items`
- `POST /orders/:id/replace-item`
- `POST /orders/:id/return-item`
- `POST /orders/:id/cancel-return`

### 6.7 Returns

Returned item behavior is important and must be consistent across the mobile app.

Rules:

- Returned items remain visible in bills, receipts, order details, and reports.
- Returned item amount is displayed as a negative value, for example `-PKR 500`.
- The returned item price/value must have a thin red strike-through line.
- Also show a clear label such as `Returned - not charged`.
- Order totals must remain unchanged because totals already exclude returned and cancelled item rows.
- Sales revenue, sold quantity, paid-order journal entries, and menu revenue exclude returned/cancelled rows.
- Reports include returned quantity and returned amount fields.

Apply this in:

- Table bill.
- POS loaded order/cart view.
- Receipt print and receipt preview.
- Order detail.
- Sales report.
- Menu report.
- Exported/printed report views.

### 6.8 Payment

Supported payment methods in current web workflows:

- Cash.
- Card.
- JazzCash.
- EasyPaisa.
- Cash on delivery for delivery/rider workflows.
- Mixed cash/card in rider collection workflows.

Mobile payment behavior:

- Show tendered amount for cash.
- Calculate change.
- Persist payment method with status update/payment submission.
- Print or share receipt after payment if requested.
- Respect receipt template settings.

Primary API:

- `PATCH /orders/:id/status`

### 6.9 Printing

Printing uses saved receipt/KOT templates from restaurant settings.

Mobile must support:

- KOT printing.
- Receipt printing.
- Template preview.
- Header/footer/logo/field visibility as stored in settings.
- New-item-only KOT when adding to existing active table orders.
- Returned items shown with label, negative value, and red strike-through.

Settings source:

- `GET /restaurant/settings`
- `PATCH /restaurant/settings`

Mobile implementation can use native print, PDF/share, Bluetooth POS printing, or platform print plugins, but the content must follow the saved templates.

## 7. Orders

Web route: `/orders`

Order management shows orders across dine-in, takeaway, delivery, online, and table workflows.

Mobile requirements:

- List orders with filters by status, type, table, date, and search.
- View order detail with items, totals, customer, table, rider, waiter, notes, timestamps.
- Update status.
- Print receipt or KOT.
- Assign rider where applicable.
- Cancel order where allowed.
- Show returned items with the returned visual rule.

Primary APIs:

- `GET /orders`
- `POST /orders`
- `PATCH /orders/:id/status`
- Return/add/replace APIs listed in POS section.

Common statuses include:

- `pending`
- `confirmed`
- `preparing`
- `ready`
- `served`
- `paid`
- `cancelled`
- Delivery/rider statuses such as `picked`, `out_for_delivery`, and `delivered` where applicable.

## 8. Kitchen Display

Web route: `/kitchen`

Kitchen display shows active kitchen orders and lets staff advance preparation status.

Mobile requirements:

- Show pending, confirmed, preparing, and ready orders.
- Display order number, table/order type, items, quantities, notes, and prep timing.
- Tap actions should advance status using the same backend flow.
- Delivery ready orders should not automatically become served.
- Real-time updates should refresh the kitchen list when orders change.

Primary APIs:

- `GET /orders`
- `PATCH /orders/:id/status`

## 9. Table Management

Web route: `/tables`

Dining table management includes floor/table status, setup, active bills, and table actions.

Mobile requirements:

- Show table grid/list with filters for section, status, and search.
- Table statuses: `vacant`, `occupied`, `reserved`, `cleaning`.
- Use `vacant`; do not use invalid status `available`.
- Occupied tables must be clearly marked.
- Show table status summary counts.
- Support table setup for restaurants that skipped setup.
- Add, edit, and delete tables.
- Prevent or warn on unsafe delete/status transitions when active orders exist.
- Show table detail with assign, mark served, view bill, mark cleaning, clear reservation, and mark vacant actions.
- Show food-ready/running-bill/overtime/no-show signals where returned by backend.

Primary APIs:

- `GET /tables`
- `POST /tables`
- `PATCH /tables/:id`
- `DELETE /tables/:id`
- `PATCH /tables/:id/status`
- `POST /tables/:id/overtime-alert`
- `GET /orders/table/:tableId/active`

### 9.1 Table Bill

Bill behavior:

- Show unpaid active order items.
- Returned items remain visible.
- Returned item line shows `Returned - not charged`.
- Returned item amount shows as a negative value, for example `-PKR 500`.
- Returned item price/value uses thin red strike-through.
- Totals stay unchanged because returned rows are already excluded.
- Support payment and receipt printing.

## 10. Reservations

Web route: `/reservations`

Mobile requirements:

- Create reservations with customer, date/time, party size, table, and notes.
- List/filter reservations.
- Update reservation status/details.
- Connect reserved table state with table management where backend supports it.

Primary APIs:

- `GET /reservations`
- `POST /reservations`
- `PATCH /reservations/:id`

## 11. Menu Management

Web route: `/menu-mgmt`

Menu management includes categories, menu items, images, visibility, pricing rules, and deletion safeguards.

### 11.1 Categories

Category behavior:

- List categories including inactive where requested.
- Create/edit category name, description, parent, sort order, active state.
- Edit/delete controls exist in menu management only, not POS category navigation.
- Prevent category deletion when it has child menu items or sold items.
- If deletion is blocked, category can be made inactive instead.

Primary APIs:

- `GET /menu/categories`
- `POST /menu/categories`
- `PUT /menu/categories/:id`
- `DELETE /menu/categories/:id`

### 11.2 Menu Items

Item behavior:

- Create/edit item name, description, category, prep time, image, status, kitchen route.
- Cloudinary-backed image storage is used for dev/prod.
- Item visibility flags: POS, web, delivery.
- Tax included/applicable flags.
- Discount eligibility.
- Open price and price override role settings.
- Price modes: variant, weight, piece, pack.
- Variants with default and active state.
- Add-on groups and add-ons where supported.
- Weekend price rule and weekend days.
- Promotion/popular labels and sort order.
- Prevent deletion when item was used in sales.
- Sold menu items should be made inactive instead of deleted.

Primary APIs:

- `GET /menu`
- `POST /menu/items`
- `PUT /menu/items/:id`
- `DELETE /menu/items/:id`
- `POST /menu/items/:id/image`

## 12. Inventory And Recipes

Web routes:

- `/inventory`
- `/recipes`
- `/alerts`

Mobile inventory requirements:

- List inventory items.
- Create/edit/delete inventory items.
- Update stock.
- View stock transactions.
- Show low-stock alerts.
- Show inventory report.
- Allow recipe creation and recipe list.

Primary APIs:

- `GET /inventory`
- `POST /inventory`
- `PUT /inventory/:id`
- `DELETE /inventory/:id`
- `PATCH /inventory/:id/stock`
- `GET /inventory/alerts`
- `GET /inventory/transactions`
- `GET /inventory/report`
- `GET /recipes`
- `POST /recipes`
- `GET /notifications`
- `PATCH /notifications/read`

## 13. Employees, Roles, Attendance, And Shifts

Web routes:

- `/employees`
- `/attendance`
- `/my-shift`
- `/shift-management`
- `/shift-sales-report`

### 13.1 Employees And Roles

Mobile requirements:

- List employees.
- Create/edit employees.
- Upload employee photo where mobile supports image upload.
- Show role and employment details.
- Roles and permission toggles.
- System roles are read-only.
- Custom roles can be created/updated.

Primary APIs:

- `GET /employees`
- `POST /employees`
- `PUT /employees/:id`
- `POST /employees/:id/photo`
- `GET /roles`
- `POST /roles`
- `PATCH /roles/:id`

### 13.2 Attendance

Mobile requirements:

- Clock in and clock out.
- Show current attendance status.
- Show attendance logs, daily overview, monthly summary.
- Support manual logs, void log, recompute.
- Support leaves, holidays, overtime rules, and corrections where used by management screens.

Primary APIs:

- `POST /attendance/clock-in`
- `POST /attendance/clock-out`
- `GET /attendance/status`
- `GET /attendance/logs`
- `POST /attendance/logs`
- `PATCH /attendance/logs/:id/void`
- `GET /attendance/daily`
- `GET /attendance/today`
- `POST /attendance/recompute`
- `GET /attendance/leaves`
- `POST /attendance/leaves`
- `PATCH /attendance/leaves/:id`
- `GET /attendance/holidays`
- `POST /attendance/holidays`
- `PATCH /attendance/holidays/:id`
- `DELETE /attendance/holidays/:id`
- `GET /attendance/ot-rules`
- `POST /attendance/ot-rules`
- `PATCH /attendance/ot-rules/:id`
- `GET /attendance/corrections`
- `POST /attendance/corrections`
- `PATCH /attendance/corrections/:id`
- `GET /attendance/summary/monthly`

### 13.3 Shift Management

Shift management supports schedules, open/close, force close, and reports.

Mobile requirements:

- My Shift screen for staff to start, continue, and close their own shift.
- Shift Management screen for managers to create weekly shift schedules.
- Template shifts: Morning, Afternoon, Evening, Night, Split, Regular, Custom.
- Working days selection.
- Date-from/date-to schedule range.
- Opening balance required where configured.
- Close shift with cash summary and collection.
- Force close available for managers.
- Open/Close tab must show already opened/in-progress shifts from `/shifts/open`, matching the Staff -> Employees shift schedule table force-close visibility.
- Deduplicate sessions already present in today's active shift list.

Primary APIs:

- `GET /shifts/current`
- `GET /shifts/my`
- `GET /shifts/open`
- `GET /shifts`
- `POST /shifts`
- `POST /shifts/bulk`
- `PATCH /shifts/:id`
- `PATCH /shifts/:id/start`
- `PATCH /shifts/:id/continue`
- `PATCH /shifts/:id/close-my`
- `PATCH /shifts/:id/force-close`
- `DELETE /shifts/:id`
- `GET /shifts/:id/cash-summary`
- `POST /shifts/auto-close`
- `GET /reports/shift-sales`

## 14. Delivery Platform Management

Web route: `/delivery`

Delivery dashboard supports third-party platform order handling.

Mobile requirements:

- Tabs or sections for Orders, Platforms, and Analytics.
- Show platform orders by platform/status.
- Pending orders include countdown/expiry behavior.
- Accept order with prep time.
- Reject order with reason.
- Active order pipeline: confirmed, preparing, ready, served/delivered depending workflow.
- Order history.
- Platform settings: active toggle, commission percent, prep time, auto accept, API key, webhook URL.
- Simulate/test order where admin/development flow permits.
- Stats: total orders, revenue, commission, net, platform breakdown.

Primary APIs:

- `GET /delivery/orders`
- `POST /delivery/simulate`
- `PATCH /delivery/orders/:id/accept`
- `PATCH /delivery/orders/:id/reject`
- `GET /delivery/platforms`
- `PATCH /delivery/platforms/:platform`
- `GET /delivery/stats`

## 15. Rider Delivery Management

Web routes:

- `/phone-orders`
- `/rider`
- `/collections`
- `/daily-audit`
- `/incentives`
- `/rider-reports`

### 15.1 Phone Orders And Assignment

Mobile requirements:

- Create phone delivery orders.
- List phone orders.
- Assign rider to order.
- Show riders list.

Primary APIs:

- `GET /rider/riders`
- `POST /rider/phone-orders`
- `GET /rider/phone-orders`
- `PATCH /rider/orders/:id/assign`

### 15.2 Rider App Flow

Rider workflow:

- See available orders.
- Claim order.
- See own orders.
- Pick order.
- Navigate to customer using latitude/longitude or address.
- Collect payment.
- Support cash, card, and mixed collection.
- Validate tendered amount covers total.
- Record notes.
- Real-time updates via socket events should refresh available/my orders.

Primary APIs:

- `GET /rider/available-orders`
- `POST /rider/orders/:id/claim`
- `GET /rider/my-orders`
- `PATCH /rider/orders/:id/pick`
- `POST /rider/collections`

### 15.3 Cashier Collections

Mobile manager/cashier requirements:

- View cashier summary.
- View rider orders needing collection.
- Record collection from rider.
- Update existing collection where allowed.

Primary APIs:

- `GET /rider/cashier/summary`
- `GET /rider/cashier/rider/:riderId/orders`
- `POST /rider/cashier/collect`
- `PATCH /rider/cashier/collections/:id`

### 15.4 Audit, Incentives, Reports

Mobile management requirements:

- Daily audit report.
- Incentive rule CRUD.
- Process incentives.
- Incentive payment list/update/delete.
- Incentive payment delivery detail.
- Rider performance reports.

Primary APIs:

- `GET /rider/audit`
- `GET /rider/incentives/rules`
- `POST /rider/incentives/rules`
- `PATCH /rider/incentives/rules/:id`
- `DELETE /rider/incentives/rules/:id`
- `POST /rider/incentives/process`
- `GET /rider/incentives/payments`
- `PATCH /rider/incentives/payments/:id`
- `DELETE /rider/incentives/payments/:id`
- `GET /rider/incentives/payments/:id/deliveries`
- `GET /rider/reports`

## 16. Reports

Web routes:

- `/reports`
- `/shift-sales-report`
- `/gl-reports`

Report screens:

- Sales report.
- Employee report.
- Menu report.
- Performance report.
- Shift sales report.
- GL trial balance.
- GL balance sheet.

Sales report requirements:

- Date presets: Today, Yesterday, Last 7 Days, Last 30 Days, This Month, This Year, Custom.
- KPI cards: Total Revenue, Paid Orders, Avg Order Value, Total Guests, Returned Value.
- Returned Value appears on top with the other KPI cards.
- Returned Value is shown as a negative value and with thin red strike-through.
- Show cancelled orders, returned items, subtotal, discounts, tax, net revenue.
- Revenue by day/period.
- Revenue by order type.
- Orders by hour.
- Top selling items including returned quantity and returned amount.
- Print/export equivalent to web where mobile platform supports it.

Menu report requirements:

- Sold quantity and revenue exclude returned/cancelled item rows.
- Returned quantity and returned amount are visible.
- Returned values use returned visual rule.

Primary APIs:

- `GET /reports/sales`
- `GET /reports/employees`
- `GET /reports/menu`
- `GET /reports/performance`
- `GET /reports/shift-sales`
- `GET /gl/reports/trial-balance`
- `GET /gl/reports/balance-sheet`

## 17. Ledger And General Ledger

Web routes:

- `/ledger`
- `/gl-setup`
- `/gl-reports`

Mobile requirements:

- GL account list/create/edit/delete.
- Journal entry list/create.
- Sales mappings.
- Inventory mappings.
- Trial balance and balance sheet.
- Paid-order journal entries exclude returned/cancelled item rows.

Primary APIs:

- `GET /gl/accounts`
- `POST /gl/accounts`
- `PUT /gl/accounts/:id`
- `DELETE /gl/accounts/:id`
- `GET /gl/entries`
- `POST /gl/entries`
- `GET /gl/mappings/sales`
- `POST /gl/mappings/sales`
- `GET /gl/mappings/inventory`
- `POST /gl/mappings/inventory`
- `GET /gl/reports/trial-balance`
- `GET /gl/reports/balance-sheet`

## 18. Restaurant Settings

Web routes:

- `/settings`
- `/discount-presets`

Settings include:

- General restaurant info.
- Logo upload.
- Tax rates.
- Payment methods.
- Roles and permissions.
- Alert thresholds.
- Table overtime hours.
- WhatsApp integration and test.
- Receipt/KOT print designer.
- Discount presets.

### 18.1 Tax Settings

Tax behavior:

- Tax rates can be enabled/disabled.
- Tax rates can apply to all, dine-in, delivery, or online.
- Item-level tax flags interact with global tax settings.
- POS, orders, sales, and invoices use the same tax logic.

### 18.2 Print Designer

Print designer stores settings at restaurant level:

- Receipt template.
- KOT template.
- Header content.
- Footer content.
- Logo settings.
- Field visibility.
- Defaults based on current printing behavior.

Mobile requirements:

- Use saved templates for print output.
- Settings editor can be mobile-friendly but must save the same data shape.

### 18.3 Discount Presets

Discount presets:

- Name.
- Type: percent or flat.
- Value.
- Active/inactive.
- Sort order.
- Visible in POS only when active.
- Percent cannot exceed 100.

Primary APIs:

- `GET /restaurant/settings`
- `PATCH /restaurant/settings`
- `POST /restaurant/logo`
- `GET /discount-presets`
- `POST /discount-presets`
- `PUT /discount-presets/:id`
- `DELETE /discount-presets/:id`

## 19. Delivery Pricing

Web route: `/delivery-pricing`

Mobile management requirements:

- Delivery zones CRUD.
- Delivery areas CRUD.
- Surge rules CRUD.
- Customer rules CRUD.
- Delivery fee preview.
- Restaurant location view/save.

Primary APIs:

- `GET /delivery-pricing/zones`
- `POST /delivery-pricing/zones`
- `PUT /delivery-pricing/zones/:id`
- `DELETE /delivery-pricing/zones/:id`
- `GET /delivery-pricing/areas`
- `POST /delivery-pricing/areas`
- `PUT /delivery-pricing/areas/:id`
- `DELETE /delivery-pricing/areas/:id`
- `GET /delivery-pricing/surge-rules`
- `POST /delivery-pricing/surge-rules`
- `PUT /delivery-pricing/surge-rules/:id`
- `DELETE /delivery-pricing/surge-rules/:id`
- `GET /delivery-pricing/customer-rules`
- `POST /delivery-pricing/customer-rules`
- `PUT /delivery-pricing/customer-rules/:id`
- `DELETE /delivery-pricing/customer-rules/:id`
- `POST /delivery-pricing/preview-fee`
- `GET /delivery-pricing/restaurant-location`
- `POST /delivery-pricing/restaurant-location`

## 20. Subscriptions, Branch Groups, Support, System, And Admin

Web routes include:

- `/subscriptions`
- `/admin/module-pricing`
- `/admin/subscriptions`
- `/my-group`
- `/admin/groups`
- `/support`
- `/admin/support`
- `/system`
- `/admin/system-config`
- `/admin`

Mobile can implement these as management/admin sections if required.

Subscriptions:

- Module list.
- My subscriptions.
- Request subscription.
- Admin module pricing.
- Admin subscription approval/rejection.

Branch groups:

- My group dashboard.
- Register/update group.
- Add branch.
- Admin group CRUD.
- Assign/remove branches.
- Consolidated trial balance.
- Branch discount tiers.

Support:

- Create support ticket with optional file upload.
- My tickets.
- Ticket messages.
- Admin ticket list/detail/messages.
- Assign and resolve tickets.

System/admin:

- Restaurant registration and platform stats.
- System health.
- Backup list/create/download/delete.
- System config.
- SMTP email test.
- WhatsApp test.

Primary APIs are exposed in `frontend/src/services/api.js` under subscriptions, branches, support, system, and admin sections.

## 21. Real-Time And Refresh Behavior

The web app uses socket context for real-time updates in operational areas.

Mobile requirements:

- Use WebSocket/socket connection for order, kitchen, rider, and notification updates where backend emits events.
- Refresh lists after create/update actions.
- Refresh on app resume.
- Show clear loading, empty, error, and retry states.
- Avoid duplicate submissions by disabling action buttons while saving.

## 22. Data And Status Rules To Preserve

Do not change these rules in mobile:

- POS requires active/in-process shift and clock-in where enforced.
- Shift time checks use restaurant timezone.
- Valid table statuses include `vacant`, `occupied`, `reserved`, `cleaning`.
- Use `vacant`, not `available`.
- Categories with menu children or sold items cannot be deleted; mark inactive instead.
- Menu items used in sales cannot be deleted; mark inactive instead.
- Returned and cancelled items are excluded from charged totals, revenue, sold quantity, and paid-order journal entries.
- Returned items are still visible everywhere with label, negative amount, and thin red strike-through.
- KOT for existing active table orders prints only newly added items.
- Delivery COD/rider collection must reconcile with cashier collection.
- Local-only env files and deployment secrets are not part of app data and must not be bundled in mobile.

## 23. Backend Base URL And Assets

The web client uses `frontend/src/services/api.js` for all HTTP calls. Mobile should centralize API access in the same way.

Implementation notes:

- Configure base API URL per environment.
- Store auth token securely.
- Use multipart upload for images/files where APIs require it.
- Menu item and restaurant images may be Cloudinary URLs or backend-relative URLs.
- If a returned image URL is relative, prefix it with the configured backend/static asset base URL.

## 24. Suggested Mobile Build Phases

Phase 1 - Core operations:

- Login/session.
- Setup status redirect.
- Dashboard.
- POS with shift gate.
- Orders.
- Kitchen.
- Tables and table bill.
- Receipt/KOT template rendering.

Phase 2 - Restaurant management:

- Menu/category management.
- Employees/roles.
- Attendance and shifts.
- Reports.
- Settings, tax, discount presets, print designer.

Phase 3 - Delivery and accounting:

- Delivery platform dashboard.
- Rider app/collections/audit/incentives.
- Inventory/recipes.
- GL/ledger.

Phase 4 - Admin platform:

- Subscriptions.
- Support.
- Groups/branches.
- System/admin tools.
