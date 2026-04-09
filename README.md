# 🍽 RestaurantOS — SaaS Restaurant Management Platform

A full-stack, multi-tenant SaaS platform for restaurant management built with **Node.js**, **React**, and **PostgreSQL**. Includes POS, Kitchen Display, Table Management, Inventory Control, Recipes, General Ledger, Employee Management, Real-Time Alerts, and a Super Admin panel.

---

## 📋 Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Installation & Setup](#installation--setup)
6. [Running the App](#running-the-app)
7. [Demo Credentials](#demo-credentials)
8. [API Overview](#api-overview)
9. [Database Schema](#database-schema)
10. [Environment Variables](#environment-variables)
11. [WebSocket Events](#websocket-events)

---

## ✨ Features

| Module | Description |
|---|---|
| 🔐 Auth | JWT-based login with role-level permissions per restaurant |
| 📲 POS / Touchscreen | Menu ordering with cart, table selection, online queue |
| 👨‍🍳 Kitchen Display | Live order board: Pending → Cooking → Ready |
| 🪑 Table View | Floor plan with occupied / vacant / reserved status |
| 📦 Inventory | Stock tracking with automatic low-stock alerts |
| 📋 Recipes | Full recipe management with ingredient quantities |
| 👥 Employees | Staff profiles, roles, shifts, and permissions |
| 📊 General Ledger | Chart of accounts and double-entry journal entries |
| 🔔 Alerts | Real-time notifications for inventory & orders |
| 🏢 Super Admin | Multi-tenant dashboard to manage all restaurants |
| 📲 Online Orders | Receive and queue online orders alongside POS |
| 🔌 WebSockets | Live kitchen, table, and order updates via Socket.IO |

---

## 🛠 Tech Stack

**Backend**
- Node.js + Express
- PostgreSQL (pg driver)
- Socket.IO (real-time)
- JWT authentication (jsonwebtoken)
- bcryptjs (password hashing)
- Winston (logging)

**Frontend**
- React 18
- React Router v6
- Axios (API calls)
- Socket.IO client
- React Hot Toast (notifications)
- Recharts (charts)

---

## 📁 Project Structure

```
restaurantos/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js              # PostgreSQL pool
│   │   │   ├── migrate.js         # Run migrations
│   │   │   └── seed.js            # Run seed data
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── ordersController.js
│   │   │   ├── inventoryController.js
│   │   │   └── combinedControllers.js
│   │   ├── middleware/
│   │   │   └── auth.js            # JWT + permission middleware
│   │   ├── routes/
│   │   │   └── index.js           # All API routes
│   │   └── index.js               # Express + Socket.IO server
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/              # Login, SuperLogin
│   │   │   ├── dashboard/         # Dashboard overview
│   │   │   ├── pos/               # POS order taking
│   │   │   ├── employees/         # Staff management
│   │   │   ├── recipes/           # Recipe management
│   │   │   ├── ledger/            # General Ledger
│   │   │   ├── shared/            # Layout, UI components
│   │   │   └── pages.js           # Kitchen, Tables, Inventory, Alerts, Admin
│   │   ├── context/
│   │   │   ├── AuthContext.js
│   │   │   └── SocketContext.js
│   │   ├── services/
│   │   │   └── api.js             # Axios API service layer
│   │   ├── App.js
│   │   └── index.js
│   ├── public/
│   │   └── index.html
│   ├── .env.example
│   └── package.json
│
└── database/
    ├── migrations/
    │   └── 001_initial_schema.sql  # Full DB schema
    └── seeds/
        └── 001_seed_data.sql       # Demo data
```

---

## ✅ Prerequisites

Make sure you have the following installed:

| Tool | Version | Download |
|---|---|---|
| Node.js | v18+ | https://nodejs.org |
| npm | v9+ | Included with Node.js |
| PostgreSQL | v14+ | https://www.postgresql.org/download |
| Git | Any | https://git-scm.com |

---

## 🚀 Installation & Setup

### Step 1 — Clone / Extract the project

```bash
# If cloned from git:
git clone <your-repo-url> restaurantos
cd restaurantos

# Or extract the zip:
unzip restaurantos.zip
cd restaurantos
```

---

### Step 2 — Create the PostgreSQL Database

Open your PostgreSQL client (psql, pgAdmin, DBeaver, etc.) and run:

```sql
CREATE DATABASE restaurantos;
```

Or from terminal:

```bash
psql -U postgres -c "CREATE DATABASE restaurantos;"
```

---

### Step 3 — Configure Backend Environment

```bash
cd backend
cp .env.example .env
```

Open `.env` and update these values:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=restaurantos
DB_USER=postgres
DB_PASSWORD=your_actual_password_here

JWT_SECRET=change_this_to_a_long_random_string_min_32_chars
JWT_EXPIRES_IN=8h
JWT_REFRESH_SECRET=another_different_long_random_string
JWT_REFRESH_EXPIRES_IN=7d

CLIENT_URL=http://localhost:3000
```

---

### Step 4 — Install Backend Dependencies

```bash
# You should be inside /backend
npm install
```

---

### Step 5 — Run Database Migrations

This creates all the tables, indexes, triggers, and functions:

```bash
npm run migrate
```

Expected output:
```
Running migration: 001_initial_schema.sql
✓ 001_initial_schema.sql done
All migrations complete.
```

---

### Step 6 — Run Database Seeds

This inserts demo restaurants, employees, menu items, inventory, orders, and notifications:

```bash
npm run seed
```

Expected output:
```
Running seed: 001_seed_data.sql
✓ 001_seed_data.sql done
All seeds complete.
```

> **Tip:** You can run both together with: `npm run setup`

---

### Step 7 — Configure Frontend Environment

```bash
cd ../frontend
cp .env.example .env
```

The defaults work for local development:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000
```

---

### Step 8 — Install Frontend Dependencies

```bash
# You should be inside /frontend
npm install
```

---

## ▶️ Running the App

### Start the Backend (API + WebSocket)

```bash
# From /backend directory
npm run dev          # Development with auto-reload (nodemon)
# or
npm start            # Production mode
```

The API will be available at: **http://localhost:5000**  
Health check: **http://localhost:5000/api/health**

---

### Start the Frontend (React)

Open a new terminal:

```bash
# From /frontend directory
npm start
```

The app will open at: **http://localhost:3000**

---

## 🔑 Demo Credentials

### Restaurant Staff Login (Golden Fork)

| Field | Value |
|---|---|
| Restaurant Slug | `golden-fork` |
| Email | `ahmed@goldenfork.com` |
| Password | `password123` |
| Role | Manager (full access) |

Other staff accounts (same password):

| Name | Email | Role |
|---|---|---|
| Maya Chen | maya@goldenfork.com | Head Server |
| Jake Morrison | jake@goldenfork.com | Server |
| Tom Baker | tom@goldenfork.com | Chef |
| Nina Frost | nina@goldenfork.com | Cashier |

### Super Admin Login

| Field | Value |
|---|---|
| URL | http://localhost:3000/super-login |
| Email | superadmin@restaurantos.com |
| Password | password123 |

---

## 🌐 API Overview

All API endpoints are prefixed with `/api`.

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Employee login (restaurant slug required) |
| POST | `/auth/super-login` | Super admin login |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout & invalidate token |

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard/stats` | Today's revenue, orders, tables, alerts |

### Orders
| Method | Endpoint | Description |
|---|---|---|
| GET | `/orders` | List orders (filter by status, type, date) |
| POST | `/orders` | Create new order |
| PATCH | `/orders/:id/status` | Advance order status |

### Tables
| Method | Endpoint | Description |
|---|---|---|
| GET | `/tables` | All tables with live order info |
| POST | `/tables` | Create a table |
| PATCH | `/tables/:id/status` | Update table status |

### Menu
| Method | Endpoint | Description |
|---|---|---|
| GET | `/menu` | Categories + all menu items |
| POST | `/menu/items` | Create menu item |
| PUT | `/menu/items/:id` | Update menu item |

### Inventory
| Method | Endpoint | Description |
|---|---|---|
| GET | `/inventory` | All items with alert status |
| POST | `/inventory` | Add inventory item |
| PATCH | `/inventory/:id/stock` | Update stock (purchase/usage/waste) |
| GET | `/inventory/alerts` | Only low/critical items |

### Recipes
| Method | Endpoint | Description |
|---|---|---|
| GET | `/recipes` | All recipes with ingredients |
| POST | `/recipes` | Create recipe with ingredients |

### Employees
| Method | Endpoint | Description |
|---|---|---|
| GET | `/employees` | All employees with today's shift |
| POST | `/employees` | Create employee |
| PUT | `/employees/:id` | Update employee |

### General Ledger
| Method | Endpoint | Description |
|---|---|---|
| GET | `/gl/accounts` | Chart of accounts with balances |
| GET | `/gl/entries` | Journal entries (with date filter) |
| POST | `/gl/entries` | Create balanced journal entry |

### Notifications
| Method | Endpoint | Description |
|---|---|---|
| GET | `/notifications` | All notifications |
| PATCH | `/notifications/read` | Mark notifications as read |

### Admin (Super Admin only)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/restaurants` | All restaurants with stats |
| POST | `/admin/restaurants` | Register new restaurant |
| GET | `/admin/stats` | Platform-wide statistics |

---

## 🗄 Database Schema

### Core Tables

| Table | Description |
|---|---|
| `plans` | SaaS subscription plans (Starter, Pro, Enterprise) |
| `restaurants` | Tenants — each restaurant is a row |
| `roles` | Permission sets per restaurant |
| `users` | Super admin users |
| `employees` | Restaurant staff with login credentials |
| `shifts` | Employee shift scheduling |
| `dining_tables` | Physical tables per restaurant |
| `reservations` | Table reservations |
| `categories` | Menu categories |
| `menu_items` | Dishes and drinks |
| `recipes` | Recipe cards |
| `recipe_ingredients` | Ingredient-to-inventory links |
| `inventory_items` | Stock items |
| `inventory_transactions` | Purchase / usage / waste log |
| `orders` | Customer orders |
| `order_items` | Line items within orders |
| `notifications` | System and inventory alerts |
| `gl_accounts` | Chart of accounts |
| `journal_entries` | GL journal entries |
| `journal_lines` | Debit/credit lines |
| `refresh_tokens` | JWT refresh token store |

### Automatic Database Triggers

- **`update_updated_at`** — Auto-updates `updated_at` on record changes
- **`check_inventory_alert`** — Fires when stock is updated; auto-inserts a notification if stock drops below minimum threshold

---

## 🔌 WebSocket Events

Connect to: `http://localhost:5000`

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `join_restaurant` | `restaurantId` | Join restaurant's private room |
| `kitchen_update` | `{ restaurantId, orderId, status }` | Broadcast kitchen status change |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `new_order` | `{ orderId, orderNumber }` | New order created |
| `order_updated` | `{ orderId, status }` | Order status changed |
| `table_updated` | `{ table object }` | Table status changed |

---

## 🔐 Permission System

Each role has a JSON array of permissions:

```json
["dashboard", "pos", "kitchen", "tables", "inventory", "recipes", "employees", "gl", "alerts", "settings"]
```

| Role | Permissions |
|---|---|
| Manager | All |
| Head Server | pos, kitchen, tables, alerts |
| Server | pos, tables, alerts |
| Chef | kitchen, recipes, inventory, alerts |
| Cashier | pos, alerts |

---

## 🚧 Production Deployment Notes

1. Set `NODE_ENV=production` in backend `.env`
2. Build React: `cd frontend && npm run build`
3. Serve the `build/` folder with nginx or Express static
4. Use a process manager: `pm2 start src/index.js --name restaurantos-api`
5. Set up SSL with Let's Encrypt
6. Use a managed PostgreSQL instance (Railway, Supabase, RDS)
7. Store JWT secrets securely (AWS Secrets Manager, etc.)

---

## 📞 Support

For issues or questions, check the API health endpoint first:

```bash
curl http://localhost:5000/api/health
```

Check backend logs for database connectivity errors. Most issues are related to `.env` configuration or PostgreSQL connection settings.
#   r e s t a u r a n t o s  
 