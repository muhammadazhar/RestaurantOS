# RestaurantOS User Acceptance Testing Plan

Version: 1.0  
Date: 2026-05-14  
Prepared for: RestaurantOS stakeholders, QA, restaurant operations, and product owners

## 1. Objective

The objective of UAT is to verify that RestaurantOS supports real restaurant operations across online and local offline modes before business sign-off. UAT confirms that restaurant users can complete daily workflows, super admins can manage SaaS operations, and offline-created operational data syncs correctly when cloud connectivity is available.

## 2. Scope

### In Scope

- Authentication and role-based access.
- Restaurant onboarding and setup.
- POS ordering, table orders, takeaway orders, returns, replacements, and payments.
- Kitchen display workflow.
- Table management and reservations.
- Inventory, recipes, and menu management.
- Employees, roles, shifts, and attendance.
- Rider delivery, phone orders, collections, daily audit, incentives, and rider reports.
- Reports, refunds, general ledger, and shift sales reports.
- Subscription request, approval, renewal, and module access.
- Support tickets.
- Offline local mode, sync queue, cloud push, and cloud-to-local master data pull.
- Super admin management.

### Out of Scope

- Third-party live payment gateway settlement.
- Production Railway deployment while Railway subscription is expired.
- External accounting system integration.
- Native mobile application testing unless separately scoped.

## 3. UAT Roles

| Role | Responsibility |
|---|---|
| Product Owner | Confirms business acceptance and priority. |
| Restaurant Manager | Validates POS, shifts, staff, reports, inventory, and subscriptions. |
| Cashier | Validates order taking, payment, refunds, collections, and shift closing. |
| Kitchen Staff | Validates kitchen display and preparation workflow. |
| Rider | Validates delivery claim, pickup, delivery, and collection workflow. |
| Super Admin | Validates SaaS admin, subscriptions, support, groups, and pricing. |
| QA Lead | Executes test cases, records results, and manages defects. |
| Technical Lead | Confirms logs, sync status, data consistency, and environment readiness. |

## 4. Test Environments

| Environment | URL | Database | Purpose |
|---|---|---|---|
| Local Offline | `http://localhost:5051` | Local Docker PostgreSQL | Offline/local server testing. |
| Local Online | `http://localhost:5052` | Neon PostgreSQL | Cloud behavior and sync target testing. |
| Railway Production | Railway backend/frontend URLs | Neon PostgreSQL | Deferred until Railway subscription is renewed. |

## 5. Entry Criteria

- Target environment is running and health endpoint returns `ok`.
- Test users and roles exist.
- Master data exists: tables, menu items, categories, employees, roles, inventory, recipes, and subscriptions.
- Local offline `CLOUD_API_URL` and `CLOUD_SYNC_TOKEN` are configured when sync testing is required.
- Known open defects are documented before testing begins.

## 6. Exit Criteria

- All critical and high-priority test cases pass.
- No unresolved blocker defects remain.
- Offline sync scenarios complete successfully with queue status `synced`.
- UAT sign-off is captured from Product Owner and Restaurant Manager.
- Deferred items are documented with owner and target release.

## 7. Defect Severity

| Severity | Definition | Example |
|---|---|---|
| Blocker | Prevents core system use. | Cannot log in, cannot create order, database unavailable. |
| Critical | Major business process is broken. | Payment completes but order remains unpaid. |
| High | Important workflow works incorrectly or loses data. | Offline order does not sync after cloud returns. |
| Medium | Workaround exists but user experience is affected. | Incorrect status label until refresh. |
| Low | Cosmetic or minor usability issue. | Alignment, color, or wording issue. |

## 8. UAT Test Cases

### 8.1 Authentication and Access

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| AUTH-01 | Restaurant user login | Open login, enter restaurant/branch, email, password. | User lands on permitted default page with correct menu items. |
| AUTH-02 | Super admin login | Open `/super-login`, enter super admin credentials. | Super admin SaaS menu appears. |
| AUTH-03 | Role restriction | Log in with limited role, open restricted page. | User cannot access unauthorized module/action. |
| AUTH-04 | Logout | Click sign out. | Session clears and user returns to login. |

### 8.2 Restaurant Setup and Settings

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| SETUP-01 | Complete setup wizard | Configure restaurant, branches, tables, and settings. | Setup status changes to complete. |
| SETUP-02 | Update restaurant settings | Change logo, tax, receipt/KOT print settings. | Settings save and appear in POS/receipt output. |
| SETUP-03 | Role permissions | Update built-in role permissions. | User with role sees updated access after refresh/login. |

### 8.3 POS and Order Management

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| POS-01 | Open shift before ordering | Open POS without active shift, start shift. | POS allows order creation after shift starts. |
| POS-02 | Create table order | Select table, add items, send to kitchen. | Order is created, table becomes occupied, KOT is available. |
| POS-03 | Add items to active order | Load occupied table, add new item. | Item is added to same order without replace error. |
| POS-04 | Replace item | Select item replacement flow. | Original item is replaced and audit trail is preserved. |
| POS-05 | Return item | Return one item from active order. | Returned line shows `Returned - not charged`; totals remain correct. |
| POS-06 | Pay bill | Open bill and complete payment. | Order becomes paid, table can be marked cleaning/vacant. |
| POS-07 | Takeaway order | Add items and pay without table. | Takeaway order completes and appears in order history. |
| POS-08 | Online order cancellation | Cancel eligible paid online order with reason. | Refund workflow starts and manual refund action is visible. |

### 8.4 Kitchen Display

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| KIT-01 | Receive order | Create POS order and send to kitchen. | Kitchen display shows new order. |
| KIT-02 | Advance kitchen status | Move order from pending to preparing to ready. | Status updates in order history and POS. |
| KIT-03 | Workflow disabled | Disable kitchen workflow in settings. | Kitchen item is hidden from active workflow as configured. |

### 8.5 Tables and Reservations

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| TBL-01 | Table status | Mark table occupied, cleaning, vacant. | Table status updates and syncs if offline mode is connected. |
| TBL-02 | View bill | Open occupied table bill. | Bill shows current items, returned items, taxes, and totals correctly. |
| TBL-03 | Reservation | Create and update reservation. | Reservation appears in table/reservation view. |

### 8.6 Menu, Inventory, and Recipes

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| MENU-01 | Create category online | Add category in online/cloud mode. | Category appears locally after master data pull. |
| MENU-02 | Create menu item online | Add item, variants, image. | POS displays item and offline cache localizes image. |
| MENU-03 | Block local master edits | Attempt menu/inventory master edit in offline local mode. | System rejects cloud-owned master edit. |
| INV-01 | Stock movement | Record purchase/usage/waste. | Quantity and inventory transaction update. |
| INV-02 | Low stock alert | Reduce stock below threshold. | Low stock alert appears. |
| REC-01 | Recipe setup | Create recipe with ingredients. | Recipe saves and is available for costing/stock planning. |

### 8.7 Staff, Shifts, and Attendance

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| STF-01 | Create employee | Add employee online. | Employee appears locally after pull. |
| SHF-01 | Open shift offline | Open shift in local offline app. | Shift syncs to online and appears active. |
| SHF-02 | Close shift | Close shift with cash summary. | Shift becomes closed and report reflects totals. |
| ATT-01 | Clock in offline | Clock in locally. | Attendance log syncs to online. |
| ATT-02 | Clock out | Clock out employee. | Latest attendance status is checked out. |

### 8.8 Delivery and Rider Operations

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| DEL-01 | Create phone order | Enter customer, items, delivery details. | Phone order is created and available for assignment. |
| DEL-02 | Assign rider | Assign rider to order. | Rider sees assigned/available order as expected. |
| DEL-03 | Rider claim and pickup | Rider claims, picks order. | Status updates through rider dashboard. |
| DEL-04 | Collection | Rider or cashier records collection. | Collection summary updates. |
| DEL-05 | Daily audit | Open daily audit after deliveries. | Order and cash collection data reconcile. |
| DEL-06 | Delivery pricing preview | Configure zone/area/rules and preview fee. | Correct fee is calculated. |

### 8.9 Reports, Finance, and Refunds

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| RPT-01 | Sales report | Open reports for current date. | Revenue, paid orders, returned value, and items are accurate. |
| RPT-02 | Menu report | Open menu performance. | Sold quantity excludes returned/cancelled rows. |
| RPT-03 | Shift sales report | Select shift/date. | Shift totals match POS activity. |
| GL-01 | Create journal entry | Enter balanced debit/credit lines. | Entry saves only when debits equal credits. |
| GL-02 | Trial balance | Open trial balance. | Debits and credits balance. |
| REF-01 | Manual refund complete | Mark refund completed with reference. | Order payment/refund status updates. |

### 8.10 Subscriptions and SaaS Admin

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| SUB-01 | Request renewal offline | Request subscription renewal in offline app. | Request appears in online admin after sync. |
| SUB-02 | Approve online | Approve request in online admin. | Offline app pulls active status and no longer shows pending. |
| SUB-03 | Renew before expiry | Request renewal while active subscription still has time. | Renewal request is allowed and starts after current expiry. |
| ADM-01 | Module pricing | Super admin updates module price/duration. | Pricing changes affect renewal options. |
| ADM-02 | Company group discount | Configure group discount tiers. | Group branch subscription pricing reflects discount rules. |

### 8.11 Offline Sync

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| OFF-01 | Cloud unavailable | Stop online target or network, create local operational item. | Status shows pending sync; local operation succeeds. |
| OFF-02 | Cloud returns | Restore cloud target. | Queue processes and clears after push. |
| OFF-03 | Master pull | Modify master data online. | Local app receives update after pull interval/manual pull. |
| OFF-04 | Image localization | Pull menu item with Cloudinary image. | Local DB rewrites image URL to `/uploads/offline-cache/...`. |

## 9. Sign-Off

| Name | Role | Decision | Date | Notes |
|---|---|---|---|---|
|  | Product Owner | Approved / Rejected |  |  |
|  | Restaurant Manager | Approved / Rejected |  |  |
|  | QA Lead | Approved / Rejected |  |  |
|  | Technical Lead | Approved / Rejected |  |  |

