# RestaurantOS Sequence Diagrams

Version: 1.0  
Date: 2026-05-14

## 1. Restaurant Login

```mermaid
sequenceDiagram
  participant User
  participant React
  participant API
  participant DB as PostgreSQL

  User->>React: Submit restaurant, email, password
  React->>API: POST /api/auth/login
  API->>DB: Find active employee and restaurant
  DB-->>API: Employee, role, modules
  API->>API: Verify password and permissions
  API-->>React: Access token, refresh token, user payload
  React->>React: Store session and render layout
```

## 2. POS Order Creation

```mermaid
sequenceDiagram
  participant Cashier
  participant POS
  participant API
  participant DB as PostgreSQL
  participant Socket as Socket.IO
  participant Kitchen

  Cashier->>POS: Add items and submit order
  POS->>API: POST /api/orders
  API->>DB: Insert order and order_items
  API->>DB: Update table status if table order
  API->>Socket: Emit new_order / table_updated
  Socket-->>Kitchen: Push live order update
  API-->>POS: Created order
  POS-->>Cashier: Show order and KOT options
```

## 3. Order Return

```mermaid
sequenceDiagram
  participant Cashier
  participant POS
  participant API
  participant DB as PostgreSQL

  Cashier->>POS: Return selected item
  POS->>API: POST /api/orders/:id/return-item
  API->>DB: Insert order_adjustment
  API->>DB: Insert order_adjustment_items
  API->>DB: Mark item returned/cancelled
  API-->>POS: Updated order snapshot
  POS-->>Cashier: Returned line shown as not charged
```

## 4. Offline Order Sync Push

```mermaid
sequenceDiagram
  participant LocalUI as Local POS
  participant LocalAPI as Local API
  participant LocalDB as Local PostgreSQL
  participant Worker as Sync Worker
  participant CloudAPI as Cloud API
  participant Neon as Neon PostgreSQL

  LocalUI->>LocalAPI: Create/update order
  LocalAPI->>LocalDB: Save operational data
  LocalAPI->>LocalDB: Upsert offline_sync_queue item
  LocalAPI-->>LocalUI: Operation successful locally
  Worker->>LocalDB: Read pending queue
  Worker->>CloudAPI: POST /api/sync/ingest
  CloudAPI->>Neon: Upsert order snapshot
  CloudAPI-->>Worker: Success
  Worker->>LocalDB: Mark queue synced
```

## 5. Local Master Data Push

```mermaid
sequenceDiagram
  participant Manager
  participant LocalAPI as Local API
  participant LocalDB as Local PostgreSQL
  participant Worker as Local Sync Worker
  participant CloudAPI as Cloud API
  participant Neon as Neon PostgreSQL

  Manager->>LocalAPI: Add or modify menu/inventory/staff setup
  LocalAPI->>LocalDB: Save master record
  LocalAPI->>LocalDB: Queue master_data_snapshot
  Worker->>CloudAPI: POST /api/sync/ingest
  CloudAPI->>Neon: Upsert local-owned master snapshot
  CloudAPI-->>Worker: Success
  Worker->>LocalDB: Mark queue item synced
```

## 6. Subscription Request and Approval

```mermaid
sequenceDiagram
  participant Restaurant
  participant OfflineAPI as Local API
  participant LocalDB as Local DB
  participant Worker
  participant OnlineAPI as Online API
  participant Neon
  participant Admin as Super Admin

  Restaurant->>OfflineAPI: POST /api/subscriptions/request
  OfflineAPI->>LocalDB: Insert pending subscription
  OfflineAPI->>LocalDB: Queue subscription_request snapshot
  Worker->>OnlineAPI: POST /api/sync/ingest
  OnlineAPI->>Neon: Upsert pending subscription
  Admin->>OnlineAPI: PATCH /api/admin/subscriptions/:id/approve
  OnlineAPI->>Neon: Set status active and approved_at
  Worker->>OnlineAPI: POST /api/sync/master-data
  OnlineAPI-->>Worker: Subscription snapshot
  Worker->>LocalDB: Update local subscription active
```

## 7. Attendance Clock-In Sync

```mermaid
sequenceDiagram
  participant Employee
  participant LocalUI
  participant LocalAPI
  participant LocalDB
  participant Worker
  participant CloudAPI
  participant Neon

  Employee->>LocalUI: Clock in
  LocalUI->>LocalAPI: POST /api/attendance/clock-in
  LocalAPI->>LocalDB: Insert attendance_log
  LocalAPI->>LocalDB: Queue attendance_log_snapshot
  Worker->>CloudAPI: POST /api/sync/ingest
  CloudAPI->>Neon: Upsert attendance_logs
  CloudAPI-->>Worker: Success
  Worker->>LocalDB: Mark synced
```

## 8. Support Ticket Conversation

```mermaid
sequenceDiagram
  participant Restaurant
  participant React
  participant API
  participant DB
  participant Admin

  Restaurant->>React: Create ticket
  React->>API: POST /api/support/tickets
  API->>DB: Insert ticket and optional screenshot
  API-->>React: Ticket created
  Admin->>API: GET /api/admin/support/tickets
  API->>DB: Read tickets
  API-->>Admin: Ticket list
  Admin->>API: POST admin message / resolve
  API->>DB: Insert message or update status
  Restaurant->>API: GET ticket messages
  API-->>Restaurant: Conversation and status
```
