# RestaurantOS Mobile App UI Specification

Saved on: 2026-04-23

This document defines the mobile UI structure for reproducing the RestaurantOS web application as a mobile app. Pair this with `MOBILE_APP_FUNCTIONAL_SPEC.md`.

## 1. UI Principles

- Build the actual working app screens first, not a marketing landing page.
- Keep screens dense enough for restaurant operations but readable on phones.
- Prioritize speed for cashier, waiter, kitchen, and rider workflows.
- Use role-aware navigation so each user sees the workflows they need.
- Support light and dark themes.
- Use clear status colors and badges.
- Prefer bottom sheets for quick actions and forms on phone.
- Use full-screen forms only for complex edits such as menu item, employee, print template, and settings.
- Keep all important actions reachable with one hand where practical.

## 2. Suggested Navigation Architecture

### 2.1 Auth Stack

Screens:

- Login.
- Register restaurant/user.
- Forgot password.
- Reset password.
- Super admin login if admin app is included.

### 2.2 Setup Stack

Shown only when setup is incomplete.

Screens:

- Welcome.
- Dining tables.
- Menu categories.
- First menu items.
- Staff.
- Done.

Use a progress header with step labels and completion percentage.

### 2.3 Main Restaurant Bottom Tabs

Recommended default tabs for owner/manager/cashier:

- Dashboard.
- POS.
- Orders.
- Tables.
- More.

The More screen should expose role-permitted modules:

- Kitchen.
- Menu Management.
- Inventory.
- Recipes.
- Employees.
- Attendance.
- My Shift.
- Shift Management.
- Delivery.
- Rider Delivery.
- Reports.
- Shift Sales Report.
- Ledger.
- GL Setup.
- GL Reports.
- Reservations.
- Alerts.
- Settings.
- Discount Presets.
- Delivery Pricing.
- Subscriptions.
- Support.
- System/Admin sections.

### 2.4 Kitchen Mode Navigation

For kitchen users, use a focused tab set:

- Pending.
- Preparing.
- Ready.
- All.

Orders should be large tap cards with item notes clearly visible.

### 2.5 Rider Mode Navigation

For rider users, use:

- Available.
- My Orders.
- Collections.
- Reports or Profile.

The rider flow should put navigation/map and payment collection actions on the order card/detail screen.

## 3. Visual System

Use the same conceptual theme tokens as the web app.

Core tokens:

- Page background.
- Surface background.
- Card background.
- Border.
- Primary text.
- Secondary text.
- Muted text.
- Accent.
- Accent glow/background.
- Green/success.
- Blue/info.
- Red/danger.
- Purple/special.
- Warning/orange.

Status usage:

- Success/paid/ready/delivered: green.
- In-progress/preparing: purple or accent.
- Confirmed/info: blue.
- Pending/waiting: warning.
- Cancelled/returned/error: red.
- Disabled/inactive: muted gray.

Typography:

- Use a modern sans-serif.
- Avoid viewport-scaled font sizes.
- Keep letter spacing at 0 for normal UI text.
- Minimum body text size should be readable on small screens.
- Use monospace only for amounts, order numbers, counters, or technical values where alignment helps.

Touch targets:

- Minimum target size: 44 x 44 px.
- Give destructive actions confirmation dialogs.
- Keep primary action sticky at the bottom for long forms.

## 4. Common Components

### 4.1 Cards

Use cards for individual items:

- Order cards.
- Table cards.
- Menu item cards.
- KPI cards.
- Employee cards.
- Report summary cards.

Avoid nesting cards inside cards.

### 4.2 Badges

Use badges for:

- Order status.
- Table status.
- Payment status.
- Shift status.
- Active/inactive.
- Returned/cancelled item state.

### 4.3 Segmented Controls

Use segmented controls for:

- Order type: dine-in, takeaway, delivery, online.
- Kitchen status tabs.
- Report tabs.
- Payment method selection.
- Theme settings where applicable.

### 4.4 Bottom Sheets

Use bottom sheets for quick mobile workflows:

- Cart.
- Payment.
- Table actions.
- Order detail.
- Item modifiers/variants.
- Return/replace item confirmation.
- Shift start/close.
- Filters.

### 4.5 Forms

Use full-screen or pushed screens for complex forms:

- Menu item create/edit.
- Employee create/edit.
- Settings sections.
- Print template designer.
- Shift schedule builder.
- Delivery pricing rules.

Form behavior:

- Show required fields.
- Validate before submit.
- Disable submit while saving.
- Show server error text clearly.
- Keep unsaved form state during keyboard open/close.

### 4.6 Empty, Loading, And Error States

Every list screen needs:

- Loading skeleton/spinner.
- Empty state with one useful next action.
- Error state with retry.
- Pull-to-refresh where suitable.

## 5. Returned Item Visual Rule

This is a required cross-app visual rule.

Returned items must be easy to identify everywhere:

- Show label: `Returned - not charged`.
- Show returned value as a negative amount, for example `-PKR 500`.
- Apply a thin red strike-through line to the item price/value.
- Use red text or red accent for the returned amount.
- Do not reduce order total again in the UI; totals already exclude returned items.

Suggested native style:

- `textDecorationLine: 'line-through'`
- `textDecorationColor: '#dc2626'`
- `textDecorationStyle: 'solid'`
- Use 1 px visual thickness if the platform supports decoration thickness.
- Color amount text `#dc2626`.

Apply this rule in:

- POS active order/cart.
- Table bill.
- Receipt preview.
- Printed receipt.
- Order detail.
- Sales report KPI and rows.
- Menu report returned values.
- Export/print preview screens.

## 6. Screen Specifications

### 6.1 Login

Layout:

- RestaurantOS brand/header.
- Email/username field.
- Password field.
- Login button.
- Forgot password link.
- Register link if public restaurant registration remains enabled.
- Error message area.

Behavior:

- Save token securely after successful login.
- Route to setup if incomplete.
- Route to dashboard or role default if setup complete.

### 6.2 Setup Wizard

Layout:

- Top progress indicator.
- Step title.
- Step content.
- Back, Skip, Continue buttons.

Dining tables step:

- Preset cards.
- Custom table form: label, section, capacity.
- Current table list with remove action.

Categories step:

- Preset cards.
- Custom category input.
- Category list with remove action.

Menu step:

- Repeating item rows/cards: name, price, category, prep time.
- Add/remove item.

Staff step:

- Repeating staff cards: name, email, phone, role.
- Add/remove staff.

### 6.3 Dashboard

Layout:

- Header with restaurant name and date.
- KPI cards in a two-column grid on phones.
- Recent activity/order list.
- Alerts/notifications section.
- Quick action buttons based on role.

Quick actions:

- Open POS.
- View Kitchen.
- View Tables.
- Start/Close Shift.
- Reports.

### 6.4 POS

Recommended phone layout:

- Header: shift state, order type, selected table/customer summary.
- Horizontal category chips.
- Search bar.
- Menu item grid/list.
- Floating cart button showing item count and total.
- Cart bottom sheet.

Menu item card:

- Image if available.
- Item name.
- Category or kitchen route.
- Default price.
- Variant indicator if variants exist.
- Unavailable/inactive state.

Item modifier sheet:

- Variants.
- Quantity stepper.
- Notes.
- Add-ons if present.
- Add to cart button.

Cart sheet:

- Order type selector.
- Table selector for dine-in.
- Customer fields for takeaway/delivery.
- Waiter/rider selector where needed.
- Cart item list with qty, notes, discount/tax markers.
- Return/Replace actions for existing active table items.
- Discount presets and manual discount.
- Subtotal, discount, tax, total.
- KOT button.
- Hold/save/add-to-existing-order button where applicable.
- Payment button.

Shift gate:

- If shift missing, show blocking modal/bottom sheet.
- Start shift with opening balance.
- Clock in if required.
- Continue/close prompt when shift end is reached.

Payment sheet:

- Payment method segmented control.
- Tendered amount for cash.
- Change due.
- Confirm payment.
- Print/share receipt toggle or action.

### 6.5 Orders

Layout:

- Search bar.
- Filter chips: status, order type, date.
- Order cards.
- Order detail bottom sheet.

Order card fields:

- Order number.
- Status badge.
- Order type.
- Table/customer.
- Time.
- Total.
- Short item summary.

Detail sheet:

- Customer/table/rider/waiter info.
- Item list with returned visual rule.
- Subtotal, discount, tax, total.
- Status action buttons.
- Print receipt/KOT.
- Assign rider where applicable.
- Cancel where allowed.

### 6.6 Kitchen

Phone layout:

- Status tabs at top.
- Order cards grouped by status.
- Large item text and notes.
- Prep time/timer.
- Primary status action button.

Order card:

- Order number.
- Table/order type.
- Time since placed.
- Items with quantities.
- Notes highlighted.
- Action: Start Preparing, Mark Ready, Mark Served where allowed.

### 6.7 Tables

Layout:

- Status summary row.
- Section/status filters.
- Search field.
- Table grid with stable square/rectangular cards.

Table card:

- Table label.
- Capacity.
- Section.
- Status badge.
- Running bill amount if occupied.
- Food ready indicator.
- Overtime/no-show warning if applicable.

Table detail sheet:

- Table status.
- Active order summary.
- Assign/order actions.
- View bill.
- Mark served.
- Mark cleaning.
- Clear reservation.
- Mark vacant.
- Edit/delete table for permitted users.

Table bill screen/sheet:

- Order/customer/table info.
- Item rows.
- Returned rows use the returned item visual rule.
- Totals.
- Payment button.
- Print receipt button.

### 6.8 Reservations

Layout:

- Calendar/date filter.
- Reservation cards.
- Create/edit reservation form.

Form fields:

- Customer name.
- Phone.
- Party size.
- Date/time.
- Table.
- Notes.
- Status.

### 6.9 Menu Management

Layout:

- Search.
- Category filter chips or dropdown.
- Category management entry.
- Menu item cards/list.
- Add item floating action button.

Category management:

- Category list with edit/delete.
- Inactive state.
- Blocked delete error should explain that sold/child items exist and suggest inactive state.

Menu item form:

- Basic info.
- Image picker/upload.
- Category.
- Prep time.
- Status.
- Visibility toggles: POS, web, delivery.
- Tax and discount toggles.
- Pricing mode.
- Variant list.
- Add-on groups.
- Weekend pricing.
- Price override/open price permissions.
- Save button sticky at bottom.

### 6.10 Inventory And Recipes

Inventory layout:

- Search/filter.
- Low stock alert banner.
- Item cards with current stock and reorder level.
- Stock update action.
- Transaction history.

Recipe layout:

- Recipe list.
- Recipe create form with ingredients and quantities.
- Cost summary where backend provides it.

### 6.11 Employees, Roles, Attendance

Employees:

- Employee list cards.
- Create/edit employee form.
- Role selector.
- Photo upload.
- Active/inactive state.

Roles:

- Role list.
- Permission groups as toggles.
- System roles read-only.

Attendance:

- Current status card.
- Clock in/out button.
- Logs list.
- Daily/monthly summaries.
- Leave/holiday/correction management for managers.

### 6.12 Shift Management

My Shift:

- Current shift card.
- Start/continue/close action.
- Opening balance input.
- Cash summary before close.
- Close notes/collection fields.

Shift Management:

- Tabs: Schedule, Open/Close, Reports.
- Schedule builder with employee, template, times, date range, working days, require balance.
- Schedule table/list.
- Open/Close tab list includes already open and in-progress shifts from `/shifts/open`.
- Force close action for permitted users.

### 6.13 Delivery Platform

Layout:

- Tabs: Orders, Platforms, Analytics.
- Pending order cards with countdown.
- Accept sheet with prep time.
- Reject sheet with reason.
- Active orders grouped by status.
- Platform settings forms.
- Analytics KPI cards and platform breakdown.

### 6.14 Rider App

Available tab:

- Available order cards.
- Countdown badge where applicable.
- Claim button.

My Orders tab:

- Claimed/picked/out-for-delivery cards.
- Map/navigation button.
- Pick order button.
- Collect payment button.

Collect payment sheet:

- Order total.
- Cash/card/mixed selector.
- Tendered amount.
- Card amount.
- Change due.
- Notes.
- Confirm collection.

### 6.15 Reports

Layout:

- Report type tabs.
- Date preset chips.
- Custom date range.
- KPI cards.
- Charts.
- Tables converted to mobile cards.
- Print/export actions where supported.

Sales report top KPI cards:

- Total Revenue.
- Paid Orders.
- Avg Order Value.
- Total Guests.
- Returned Value.

Returned Value:

- Negative amount.
- Thin red strike-through.
- Same returned visual rule as bills/receipts.

### 6.16 Settings

Settings should be grouped into sections:

- General.
- Tax Rates.
- Payment Methods.
- Roles and Permissions.
- Alerts and Table Overtime.
- WhatsApp.
- Receipt/KOT Designer.
- Discount Presets.

Receipt/KOT designer:

- Template selector.
- Logo toggle/settings.
- Header lines.
- Footer lines.
- Field visibility toggles.
- Preview button.
- Save button.

On phone, use a two-step designer:

- Settings form.
- Full-screen preview.

### 6.17 GL, Ledger, And Admin Screens

Use mobile management list patterns:

- Search/filter header.
- Cards instead of wide tables.
- Detail/edit screens.
- Date filters for entries and reports.
- Export/share where available.

Admin-only screens can live under More/Admin:

- Restaurants.
- Platform stats.
- Groups/branches.
- Subscriptions.
- Support tickets.
- System health/backups/config.

## 7. Mobile Printing And Sharing

Printing requirements:

- Use saved receipt/KOT templates from restaurant settings.
- Support logo/header/footer/field visibility.
- Support returned item visual rule.
- Support KOT new-items-only print for existing active table orders.

Implementation options:

- Native print dialog.
- Share PDF.
- Bluetooth POS printer integration.
- WebView/HTML print rendering if using React Native WebView or similar.

Receipt preview should be available before printing when feasible.

## 8. Permissions And Disabled States

For every protected action:

- Hide action if user should never see it.
- Disable action with explanation if the user can see but cannot execute it due to current state.
- Use confirmations for delete, force close, cancel, reject, and return.

Examples:

- Price override requires permitted role.
- Open price requires permitted role.
- Force close shift requires manager/admin permission.
- Deleting sold menu item/category is blocked.
- POS payment requires valid shift state.

## 9. Network And Offline Behavior

The web app is online-first. Mobile should also be online-first unless a later offline scope is defined.

Minimum behavior:

- Detect network errors.
- Show retry.
- Prevent duplicate submissions.
- Keep unsaved form values while retrying.
- Refresh operational screens on app resume.
- Use optimistic UI only for low-risk actions; otherwise wait for backend confirmation.

Do not invent offline order sync unless the backend is explicitly updated for it.

## 10. Accessibility

Requirements:

- Minimum 44 x 44 px touch targets.
- Sufficient text contrast in light and dark modes.
- Labels for all inputs.
- Screen-reader labels for icon-only buttons.
- Confirmation copy for destructive actions.
- Avoid text overlap in cards and buttons.
- Support device font scaling where practical without breaking operational layouts.

## 11. Data Formatting

Currency:

- Use `PKR` formatting.
- Normal positive amount: `PKR 1,250`.
- Discounts can show `-PKR 100`.
- Returned amount must show negative: `-PKR 500`.

Dates/times:

- Use restaurant timezone for shift and operational checks.
- Show local readable time on cards.
- Use ISO date values for API filters.

Statuses:

- Display status labels as human readable text.
- Convert underscores to spaces, for example `out_for_delivery` -> `Out for delivery`.

## 12. Mobile Developer Checklist

Before a mobile screen is considered complete:

- It uses the same backend API as the web app.
- It respects role/permission visibility.
- It has loading, empty, error, and success states.
- It refreshes after mutation.
- It prevents duplicate submissions.
- It handles server validation errors.
- It supports light/dark theme.
- It follows the returned item visual rule where applicable.
- It matches the web business rules for totals, taxes, shifts, statuses, and deletion safeguards.
