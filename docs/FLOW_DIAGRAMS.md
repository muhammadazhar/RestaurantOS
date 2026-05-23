# RestaurantOS Flow Diagrams

Version: 1.0  
Date: 2026-05-14

## 1. Login and Access Flow

```mermaid
flowchart TD
  A["User opens app"] --> B{"User type"}
  B -->|"Restaurant user"| C["Enter restaurant or branch code, email, password"]
  B -->|"Super admin"| D["Open super login"]
  C --> E["Backend validates employee, restaurant, role, modules"]
  D --> F["Backend validates super admin"]
  E --> G{"Valid credentials"}
  F --> G
  G -->|"No"| H["Show login error"]
  G -->|"Yes"| I["Issue JWT and refresh token"]
  I --> J["Load layout, permissions, modules, sidebar"]
```

## 2. POS Table Order Flow

```mermaid
flowchart TD
  A["Cashier opens POS"] --> B{"Active shift?"}
  B -->|"No"| C["Start or continue shift"]
  B -->|"Yes"| D["Select table or takeaway"]
  C --> D
  D --> E["Add items, variants, notes"]
  E --> F["Create order"]
  F --> G["Table marked occupied if table order"]
  G --> H["Send KOT to kitchen"]
  H --> I["Kitchen prepares order"]
  I --> J["Bill review"]
  J --> K{"Return or replace items?"}
  K -->|"Yes"| L["Record return/replacement adjustment"]
  K -->|"No"| M["Proceed to payment"]
  L --> J
  M --> N["Payment completed"]
  N --> O["Receipt printed"]
  O --> P["Table marked cleaning or vacant"]
```

## 3. Kitchen Workflow

```mermaid
flowchart TD
  A["Order sent to kitchen"] --> B["Kitchen display receives order"]
  B --> C["Kitchen accepts/prepares"]
  C --> D["Mark ready"]
  D --> E["Server/cashier serves"]
  E --> F["Order status visible in POS and order history"]
```

## 4. Offline Sync Flow

```mermaid
flowchart TD
  A["Local offline app action"] --> B{"Action type"}
  B -->|"Operational write"| C["Write local DB"]
  C --> D["Queue offline_sync_queue item"]
  D --> E{"Cloud reachable and token valid?"}
  E -->|"No"| F["Show Pending sync N"]
  E -->|"Yes"| G["Worker POSTs to cloud ingest"]
  F --> E
  G --> H["Cloud upserts Neon data"]
  H --> I["Queue item marked synced"]
  I --> J["Pending count clears"]
  B -->|"Subscription approval result"| K["Pull approved subscription state"]
  K --> L["Apply to local DB"]
  L --> M["Localize Cloudinary images"]
```

## 5. Master Data Governance Flow

```mermaid
flowchart TD
  A["User changes setup/master data"] --> B{"Running mode"}
  B -->|"Local primary"| C["Allow create/update/delete"]
  C --> D["Save to local PostgreSQL"]
  D --> E["Queue and push snapshot to Neon"]
  B -->|"Cloud/online"| F["Reject local-owned master edit"]
  F --> G["User performs edit on local server"]
  G --> C
```

## 6. Subscription Renewal Flow

```mermaid
flowchart TD
  A["Restaurant opens My Subscriptions"] --> B["Select module and renewal plan"]
  B --> C["Submit request"]
  C --> D{"Offline local mode?"}
  D -->|"Yes"| E["Insert local pending request"]
  E --> F["Queue subscription_request snapshot"]
  F --> G["Push to cloud ingest"]
  D -->|"No"| H["Insert pending request in Neon"]
  G --> H
  H --> I["Super admin reviews request"]
  I --> J{"Approve?"}
  J -->|"No"| K["Set rejected"]
  J -->|"Yes"| L["Set active with scheduled start date"]
  L --> M["Offline server pulls subscription status"]
  K --> M
  M --> N["Restaurant sees updated module status"]
```

## 7. Delivery and Rider Flow

```mermaid
flowchart TD
  A["Phone or online order created"] --> B["Order enters delivery queue"]
  B --> C{"Assignment mode"}
  C -->|"Cashier assigns"| D["Assign rider"]
  C -->|"Rider self-service"| E["Rider claims available order"]
  D --> F["Rider picks order"]
  E --> F
  F --> G["Rider delivers order"]
  G --> H{"Cash collected?"}
  H -->|"Yes"| I["Record rider collection"]
  H -->|"No"| J["Mark delivered"]
  I --> K["Cashier collection screen"]
  J --> L["Daily audit"]
  K --> L
```

## 8. Support Ticket Flow

```mermaid
flowchart TD
  A["Restaurant creates support ticket"] --> B["Ticket visible to super admin"]
  B --> C["Admin reviews and assigns"]
  C --> D["Messages exchanged"]
  D --> E{"Resolved?"}
  E -->|"No"| D
  E -->|"Yes"| F["Admin marks resolved"]
  F --> G["Restaurant sees resolved status"]
```
