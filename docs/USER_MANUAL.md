# RestaurantOS User Manual

Version: 1.0  
Date: 2026-05-14

## 1. Introduction

RestaurantOS is a restaurant operations platform for managing orders, tables, kitchen workflow, inventory, staff, delivery, subscriptions, reporting, and finance. It supports both cloud operation and a local offline server mode.

## 2. User Roles

| Role | Typical Access |
|---|---|
| Manager | POS, tables, kitchen, settings, employees, reports, inventory, subscriptions. |
| Cashier | POS, payments, refunds, collections, order history. |
| Server | POS/table ordering and table status updates. |
| Kitchen Staff | Kitchen display and order preparation status. |
| Rider | Delivery order claim, pickup, delivery, and collection. |
| Accountant | General ledger, GL reports, financial mappings. |
| Super Admin | Platform restaurants, subscriptions, pricing, groups, and support tickets. |

Access depends on configured role permissions and active module subscriptions.

## 3. Login

1. Open the application URL.
2. Enter the restaurant identifier or branch code.
3. Enter employee email and password.
4. Select login.
5. The visible menu depends on role permissions and subscribed modules.

Super admins use `/super-login`.

## 4. Navigation

The left sidebar groups major modules. The top secondary menu shows screens inside the selected group.

Main groups:

- Dashboard
- POS
- Shifts
- Tables
- Kitchen
- Staff
- Delivery
- Reports
- Finance
- Support
- Settings
- SaaS, for super admin users

The sync status indicator shows whether local mode is online, offline, pending sync, or has sync issues.

## 5. POS and Orders

### Start a Shift

1. Open POS or My Shift.
2. If no active shift exists, start or continue a shift.
3. Confirm that POS allows order entry.

### Create a Table Order

1. Open POS.
2. Select a table.
3. Add menu items and variants.
4. Add notes if needed.
5. Send to kitchen or continue editing.
6. The table becomes occupied.

### Add Items to Existing Table Order

1. Open the occupied table in POS.
2. Add new menu items.
3. Confirm the new items are added to the existing order.
4. Print/send KOT for new items if required.

### Return or Replace an Item

1. Load the active order.
2. Select return or replacement action for the item.
3. Confirm the reason/action.
4. Returned items show as returned and not charged.

### Pay a Bill

1. Open the table bill or checkout panel.
2. Review item totals, taxes, discounts, and returned lines.
3. Select payment method.
4. Complete payment.
5. Mark the table cleaning or vacant after service.

## 6. Kitchen Display

1. Open Kitchen Display.
2. Review pending orders.
3. Move orders through statuses such as pending, preparing, ready, and served.
4. POS/order history updates as kitchen statuses change.

## 7. Tables and Reservations

### Table Status

1. Open Tables.
2. Select a table.
3. Change status: vacant, occupied, cleaning, or reserved.
4. Use View Bill for active occupied tables.

### Reservations

1. Open Reservations.
2. Create reservation with customer, time, party size, and notes.
3. Update status when customer arrives, cancels, or no-shows.

## 8. Menu Management

Menu and item setup is local-primary in the on-premise offline architecture. Add or update master data from the local server; it syncs to cloud when connectivity is available.

1. Open Menu Management.
2. Create categories.
3. Create menu items, variants, add-ons, and images.
4. Save.
5. The local server pushes updated master data to cloud when connectivity is available.

## 9. Inventory and Recipes

### Inventory Items

1. Open Inventory.
2. Add or update inventory item definitions online/cloud.
3. Record stock movement for purchases, usage, waste, or adjustments.
4. Review low-stock alerts.

### Recipes

1. Open Recipes.
2. Add recipe details and ingredients.
3. Save recipe.
4. Use reports/inventory views to track usage and performance.

## 10. Staff, Attendance, and Shifts

### Employees and Roles

1. Open Employees or Settings.
2. Create employees and assign roles.
3. Configure role permissions from Settings.

### Attendance

1. Open Attendance.
2. Clock in or clock out.
3. Managers may create manual logs or void incorrect logs.
4. Use monthly summary for review.

### Shift Management

1. Open Shift Management.
2. Create shifts or bulk schedules.
3. Start, continue, close, or force-close shifts.
4. Review shift sales report.

## 11. Delivery and Rider Operations

### Phone Orders

1. Open Phone Orders.
2. Enter customer information, address, items, and delivery fee.
3. Save order.
4. Assign rider when ready.

### Rider Dashboard

1. Rider opens My Deliveries.
2. Claim or view assigned orders.
3. Mark order picked.
4. Mark delivered and record collection if applicable.

### Collections and Audit

1. Cashier opens Collections.
2. Select rider.
3. Review pending collected amounts.
4. Mark collection as received.
5. Use Daily Audit to reconcile orders and cash.

## 12. Reports and Finance

### Reports

Use Reports to review:

- Sales
- Menu performance
- Employee performance
- Shift sales
- Returned value
- Refund history

### General Ledger

1. Open GL Setup to configure accounts and mappings.
2. Open General Ledger to create journal entries.
3. Open GL Reports to review trial balance and balance sheet.

Journal entries must balance before saving.

## 13. Subscriptions

### Request Renewal

1. Open My Subscriptions.
2. Select module and renewal plan.
3. Click request subscription or renew.
4. Request remains pending until approved by super admin.

### Approval

1. Super admin opens Subscription Management.
2. Approves or rejects request.
3. Offline local server pulls approved status from cloud.

Renewals can be requested before expiry. The next subscription starts after the current active expiry.

## 14. Support Tickets

### Restaurant User

1. Open Support Tickets.
2. Create ticket with issue description and optional screenshot.
3. Send messages in the ticket thread.
4. Monitor status until resolved.

### Super Admin

1. Open Admin Support.
2. Review tickets.
3. Assign, reply, and resolve.

## 15. Offline Mode

Offline mode runs a local server and local PostgreSQL database.

Operational actions can be performed locally:

- POS orders
- Shift actions
- Attendance logs
- Dining table status updates
- Subscription requests

Master data is local-owned:

- Menu setup
- Employees
- Roles
- Tables setup
- Restaurant settings
- Inventory item definitions
- Recipes

When cloud is reachable, local queue items sync automatically. The status bar shows pending sync count and clears after successful push.

## 16. Common Troubleshooting

| Issue | Action |
|---|---|
| Login fails | Check restaurant code, email, password, and role active status. |
| Menu not visible | Check module subscription and role permissions. |
| Pending sync remains | Confirm cloud API URL, sync token, and online health endpoint. |
| Offline subscription remains pending | Refresh offline app after cloud approval or wait for pull interval. |
| Images missing offline | Confirm image localization has run and uploads volume is mounted. |
| Table status not updating online | Check queue status and cloud connectivity. |
