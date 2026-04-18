-- ============================================================
-- RestaurantOS - Seed Data
-- Run AFTER migrations. Provides demo data for 2 restaurants.
-- ============================================================

-- ─────────────────────────────────────────────
-- PLANS
-- ─────────────────────────────────────────────
INSERT INTO plans (id, name, price, max_tables, max_employees, features) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Starter',    29.00,  10,  15, '{"online_orders":false,"gl":false,"recipes":false}'),
  ('a1000000-0000-0000-0000-000000000002', 'Pro',        79.00,  30,  50, '{"online_orders":true,"gl":true,"recipes":true}'),
  ('a1000000-0000-0000-0000-000000000003', 'Enterprise', 199.00, 100, 200,'{"online_orders":true,"gl":true,"recipes":true,"multi_branch":true}');

-- ─────────────────────────────────────────────
-- RESTAURANTS
-- ─────────────────────────────────────────────
INSERT INTO restaurants (id, plan_id, name, slug, email, phone, address, city, country, currency, timezone, status) VALUES
  ('b1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000002',
   'The Golden Fork', 'golden-fork',
   'admin@goldenfork.com', '+92-21-3456-7890',
   'Shop 12, Zamzama Commercial Lane, DHA Phase 5', 'Karachi', 'Pakistan',
   'PKR', 'Asia/Karachi', 'active'),

  ('b1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001',
   'Spice Garden', 'spice-garden',
   'info@spicegarden.com', '+92-42-3333-4444',
   '45-B Gulberg III, Main Boulevard', 'Lahore', 'Pakistan',
   'PKR', 'Asia/Karachi', 'active');

-- ─────────────────────────────────────────────
-- ROLES (Golden Fork)
-- ─────────────────────────────────────────────
INSERT INTO roles (id, restaurant_id, name, permissions, is_system) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Manager',
   '["dashboard","pos","kitchen","tables","inventory","recipes","employees","attendance","shift_management","gl","alerts","settings"]', TRUE),
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Head Server',
   '["pos","kitchen","tables","alerts"]', TRUE),
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Server',
   '["pos","tables","alerts"]', TRUE),
  ('c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'Chef',
   '["kitchen","recipes","inventory","alerts"]', TRUE),
  ('c1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 'Cashier',
   '["pos","alerts"]', TRUE);

-- ─────────────────────────────────────────────
-- EMPLOYEES (Golden Fork)
-- Passwords are all: password123  (bcrypt hashed)
-- ─────────────────────────────────────────────
INSERT INTO employees (id, restaurant_id, role_id, full_name, email, phone, pin, password_hash, salary, status, joined_date) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Ahmed Khan', 'ahmed@goldenfork.com',
   '+92-300-1111111', '1234',
   '$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG',
   85000, 'active', '2023-01-15'),

  ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000002', 'Maya Chen', 'maya@goldenfork.com',
   '+92-300-2222222', '2345',
   '$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG',
   45000, 'active', '2023-03-01'),

  ('d1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000003', 'Jake Morrison', 'jake@goldenfork.com',
   '+92-300-3333333', '3456',
   '$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG',
   35000, 'active', '2023-06-01'),

  ('d1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000004', 'Tom Baker', 'tom@goldenfork.com',
   '+92-300-4444444', '4567',
   '$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG',
   70000, 'active', '2023-02-01'),

  ('d1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000005', 'Nina Frost', 'nina@goldenfork.com',
   '+92-300-5555555', '5678',
   '$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG',
   30000, 'active', '2023-07-01');

-- ─────────────────────────────────────────────
-- DINING TABLES (Golden Fork — 12 tables)
-- ─────────────────────────────────────────────
INSERT INTO dining_tables (restaurant_id, label, section, capacity, status) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'T-01', 'Main Hall', 4, 'occupied'),
  ('b1000000-0000-0000-0000-000000000001', 'T-02', 'Main Hall', 2, 'vacant'),
  ('b1000000-0000-0000-0000-000000000001', 'T-03', 'Main Hall', 6, 'occupied'),
  ('b1000000-0000-0000-0000-000000000001', 'T-04', 'Main Hall', 4, 'reserved'),
  ('b1000000-0000-0000-0000-000000000001', 'T-05', 'Main Hall', 8, 'occupied'),
  ('b1000000-0000-0000-0000-000000000001', 'T-06', 'Terrace',   2, 'vacant'),
  ('b1000000-0000-0000-0000-000000000001', 'T-07', 'Terrace',   4, 'vacant'),
  ('b1000000-0000-0000-0000-000000000001', 'T-08', 'Terrace',   6, 'reserved'),
  ('b1000000-0000-0000-0000-000000000001', 'T-09', 'VIP',       4, 'occupied'),
  ('b1000000-0000-0000-0000-000000000001', 'T-10', 'VIP',      10, 'vacant'),
  ('b1000000-0000-0000-0000-000000000001', 'T-11', 'Main Hall', 4, 'occupied'),
  ('b1000000-0000-0000-0000-000000000001', 'T-12', 'Main Hall', 2, 'vacant');

-- ─────────────────────────────────────────────
-- CATEGORIES (Golden Fork)
-- ─────────────────────────────────────────────
INSERT INTO categories (id, restaurant_id, name, sort_order) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Starters',  1),
  ('e1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Mains',     2),
  ('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Desserts',  3),
  ('e1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'Drinks',    4),
  ('e1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 'Specials',  5);

-- ─────────────────────────────────────────────
-- MENU ITEMS (Golden Fork)
-- ─────────────────────────────────────────────
INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, cost, prep_time_min, is_popular) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
   'Truffle Arancini', 'Crispy risotto balls with truffle oil and mozzarella', 1400, 400, 12, TRUE),
  ('f1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
   'Burrata Caprese', 'Fresh burrata with heirloom tomatoes and basil', 1600, 500, 8, FALSE),
  ('f1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
   'Prawn Cocktail', 'Tiger prawns with Marie Rose sauce and avocado', 1800, 600, 10, TRUE),
  ('f1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
   'Beef Ribeye 250g', 'Prime beef ribeye with herb butter and fries', 6800, 2500, 22, TRUE),
  ('f1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
   'Pan-Seared Salmon', 'Atlantic salmon with capers, lemon and wilted spinach', 3400, 1100, 18, FALSE),
  ('f1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
   'Wild Mushroom Risotto', 'Arborio rice with mixed wild mushrooms and parmesan', 2800, 800, 20, FALSE),
  ('f1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
   'Duck Confit', 'Slow-cooked duck leg with lentils and red wine jus', 4200, 1400, 25, TRUE),
  ('f1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003',
   'Crème Brûlée', 'Classic vanilla custard with caramelised sugar crust', 1200, 300, 5, TRUE),
  ('f1000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003',
   'Chocolate Fondant', 'Warm dark chocolate cake with vanilla ice cream', 1400, 350, 15, FALSE),
  ('f1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000004',
   'House Red Wine (glass)', 'Cabernet Sauvignon, smooth and full-bodied', 1100, 280, 2, FALSE),
  ('f1000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000004',
   'Craft Beer', 'Local IPA, hoppy and refreshing', 800, 200, 2, FALSE),
  ('f1000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000004',
   'Fresh Lemonade', 'Hand-squeezed with mint and sea salt', 600, 80, 3, FALSE);

-- ─────────────────────────────────────────────
-- INVENTORY ITEMS (Golden Fork)
-- ─────────────────────────────────────────────
INSERT INTO inventory_items (id, restaurant_id, name, unit, stock_quantity, min_quantity, max_quantity, cost_per_unit, supplier, category) VALUES
  ('9a000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Beef (Ribeye)', 'kg',    4.2,  5.0, 20.0,  2800.00, 'Premier Meats Karachi', 'Protein'),
  ('9a000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Wild Mushrooms', 'kg',   2.8,  2.0, 10.0,   350.00, 'Fresh Farms', 'Produce'),
  ('9a000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Atlantic Salmon', 'kg',  1.2,  3.0, 12.0,  1800.00, 'Sea Fresh Co.', 'Seafood'),
  ('9a000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'Heavy Cream', 'L',       8.5,  4.0, 15.0,   220.00, 'Dairy Direct', 'Dairy'),
  ('9a000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 'Truffle Oil', 'L',       0.4,  0.5,  2.0, 12000.00, 'Gourmet Imports', 'Condiments'),
  ('9a000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000001', 'Arborio Rice', 'kg',    12.0,  5.0, 20.0,   180.00, 'Italian Foods PK', 'Dry Goods'),
  ('9a000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000001', 'Duck Legs', 'pcs',      14.0, 10.0, 40.0,   750.00, 'Premier Meats Karachi', 'Protein'),
  ('9a000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000001', 'Tiger Prawns', 'kg',     3.8,  3.0, 12.0,  2200.00, 'Sea Fresh Co.', 'Seafood'),
  ('9a000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000001', 'Parmesan', 'kg',         2.5,  1.0,  5.0,  1800.00, 'Italian Foods PK', 'Dairy'),
  ('9a000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000001', 'Butter', 'kg',           5.0,  2.0, 10.0,   450.00, 'Dairy Direct', 'Dairy'),
  ('9a000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000001', 'Eggs', 'pcs',           48.0, 24.0, 120.0,   20.00, 'Local Farm', 'Dairy'),
  ('9a000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000001', 'All-Purpose Flour', 'kg', 10.0, 5.0, 25.0,   80.00, 'Flour Mills PK', 'Dry Goods');

-- ─────────────────────────────────────────────
-- RECIPES (Golden Fork)
-- ─────────────────────────────────────────────
INSERT INTO recipes (id, restaurant_id, menu_item_id, name, instructions, prep_time_min, cook_time_min, serves) VALUES
  ('9b000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000004',
   'Beef Ribeye 250g',
   E'1. Remove steak from refrigerator 30 minutes before cooking.\n2. Pat dry and season generously with salt and black pepper.\n3. Heat cast iron pan until smoking hot.\n4. Sear steak 3 minutes each side for medium-rare.\n5. Add butter, garlic and rosemary; baste for 2 minutes.\n6. Rest on wire rack for 8 minutes before serving.\n7. Serve with herb butter and seasoned fries.',
   15, 22, 1),

  ('9b000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001',
   'Truffle Arancini',
   E'1. Cook risotto with parmesan until thick. Cool completely.\n2. Form balls around a cube of mozzarella.\n3. Dip in beaten egg then breadcrumbs. Repeat for double coat.\n4. Deep fry at 180°C for 4-5 minutes until golden brown.\n5. Drain on paper towels. Drizzle with truffle oil.\n6. Serve with marinara sauce.',
   20, 12, 4),

  ('9b000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000006',
   'Wild Mushroom Risotto',
   E'1. Sauté mixed mushrooms in butter with thyme. Set aside.\n2. In same pan, toast arborio rice for 2 minutes.\n3. Deglaze with white wine and stir until absorbed.\n4. Add warm stock one ladle at a time, stirring constantly.\n5. When rice is al dente, fold in mushrooms, butter and parmesan.\n6. Rest covered for 2 minutes. Plate and garnish with truffle oil.',
   10, 20, 2);

-- Recipe Ingredients
INSERT INTO recipe_ingredients (recipe_id, inventory_item_id, name, quantity, unit) VALUES
  ('9b000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'Beef (Ribeye)', 0.250, 'kg'),
  ('9b000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000010', 'Butter', 0.030, 'kg'),

  ('9b000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000006', 'Arborio Rice', 0.200, 'kg'),
  ('9b000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000005', 'Truffle Oil', 0.015, 'L'),
  ('9b000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000009', 'Parmesan', 0.050, 'kg'),
  ('9b000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000011', 'Eggs', 2, 'pcs'),

  ('9b000000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-000000000006', 'Arborio Rice', 0.160, 'kg'),
  ('9b000000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-000000000002', 'Wild Mushrooms', 0.150, 'kg'),
  ('9b000000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-000000000009', 'Parmesan', 0.060, 'kg'),
  ('9b000000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-000000000010', 'Butter', 0.040, 'kg');

-- ─────────────────────────────────────────────
-- SAMPLE ORDERS
-- ─────────────────────────────────────────────
INSERT INTO orders (id, restaurant_id, order_number, order_type, status, subtotal, tax_amount, total_amount, guest_count, payment_status, employee_id) VALUES
  ('9c000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'ORD-1042', 'dine_in', 'preparing', 15200, 1216, 16416, 3, 'unpaid', 'd1000000-0000-0000-0000-000000000002'),
  ('9c000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'ORD-1043', 'dine_in', 'ready',     19600, 1568, 21168, 5, 'unpaid', 'd1000000-0000-0000-0000-000000000003'),
  ('9c000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'ORD-1044', 'dine_in', 'paid',      28400, 2272, 30672, 2, 'paid',   'd1000000-0000-0000-0000-000000000003'),
  ('9c000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'ORD-ONLINE-08', 'online', 'pending', 8900, 712, 9612, 1, 'paid', NULL);

INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, total_price, status) VALUES
  ('9c000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000004', 'Beef Ribeye 250g', 2, 6800, 13600, 'cooking'),
  ('9c000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Truffle Arancini', 1, 1400, 1400, 'cooking'),
  ('9c000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000005', 'Pan-Seared Salmon', 3, 3400, 10200, 'ready'),
  ('9c000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000006', 'Wild Mushroom Risotto', 2, 2800, 5600, 'ready'),
  ('9c000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000007', 'Duck Confit', 2, 4200, 8400, 'served'),
  ('9c000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000008', 'Crème Brûlée', 2, 1200, 2400, 'served'),
  ('9c000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000004', 'Beef Ribeye 250g', 1, 6800, 6800, 'pending'),
  ('9c000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000010', 'House Red Wine (glass)', 2, 1100, 2200, 'pending');

-- ─────────────────────────────────────────────
-- GL ACCOUNTS (Golden Fork)
-- ─────────────────────────────────────────────
INSERT INTO gl_accounts (restaurant_id, code, name, type, is_system) VALUES
  ('b1000000-0000-0000-0000-000000000001', '4001', 'Food Revenue',      'revenue',   TRUE),
  ('b1000000-0000-0000-0000-000000000001', '4002', 'Beverage Revenue',  'revenue',   TRUE),
  ('b1000000-0000-0000-0000-000000000001', '4003', 'Online Revenue',    'revenue',   TRUE),
  ('b1000000-0000-0000-0000-000000000001', '5001', 'Food Cost',         'cogs',      TRUE),
  ('b1000000-0000-0000-0000-000000000001', '5002', 'Beverage Cost',     'cogs',      TRUE),
  ('b1000000-0000-0000-0000-000000000001', '6001', 'Staff Wages',       'expense',   TRUE),
  ('b1000000-0000-0000-0000-000000000001', '6002', 'Rent & Utilities',  'expense',   TRUE),
  ('b1000000-0000-0000-0000-000000000001', '6003', 'Supplies',          'expense',   TRUE),
  ('b1000000-0000-0000-0000-000000000001', '1001', 'Cash on Hand',      'asset',     TRUE),
  ('b1000000-0000-0000-0000-000000000001', '1002', 'Bank Account',      'asset',     TRUE);

-- ─────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────
INSERT INTO notifications (restaurant_id, type, title, message, severity) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'inventory_critical', '🚨 Critical Stock: Atlantic Salmon',
   'Atlantic Salmon is at 1.2 kg (minimum: 3 kg). Please reorder immediately.', 'critical'),
  ('b1000000-0000-0000-0000-000000000001', 'inventory_critical', '🚨 Critical Stock: Truffle Oil',
   'Truffle Oil is at 0.4 L (minimum: 0.5 L). Please reorder immediately.', 'critical'),
  ('b1000000-0000-0000-0000-000000000001', 'inventory_low', '⚠️ Low Stock: Beef (Ribeye)',
   'Beef (Ribeye) is at 4.2 kg (minimum: 5 kg). Consider reordering soon.', 'high'),
  ('b1000000-0000-0000-0000-000000000001', 'order_ready', '✅ Order Ready: ORD-1043',
   'Table T-03 order is ready for service.', 'info');

-- ─────────────────────────────────────────────
-- SHIFTS (sample for today)
-- ─────────────────────────────────────────────
INSERT INTO shifts (restaurant_id, employee_id, shift_name, start_time, end_time, date, status) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Morning', '08:00', '16:00', CURRENT_DATE, 'active'),
  ('b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'Morning', '09:00', '17:00', CURRENT_DATE, 'active'),
  ('b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003', 'Morning', '09:00', '17:00', CURRENT_DATE, 'active'),
  ('b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004', 'Morning', '07:00', '15:00', CURRENT_DATE, 'active'),
  ('b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005', 'Morning', '09:00', '17:00', CURRENT_DATE, 'active');

-- ─────────────────────────────────────────────
-- SUPER ADMIN USER
-- ─────────────────────────────────────────────
INSERT INTO users (email, password_hash, full_name, is_super_admin) VALUES
  ('superadmin@restaurantos.com',
   '$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG',
   'Super Admin', TRUE);
-- Password: password123
