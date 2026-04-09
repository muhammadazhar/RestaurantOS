--
-- PostgreSQL database dump
--

\restrict fAHWAOGeWBdE4nOzDvnfzurIJPZn8OBYmUiWqYnMqUXAfuPj99cFzle4FUNjvTs

-- Dumped from database version 18.2 (Debian 18.2-1.pgdg13+1)
-- Dumped by pg_dump version 18.2 (Debian 18.2-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: check_inventory_alert(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_inventory_alert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.stock_quantity <= NEW.min_quantity THEN
    INSERT INTO notifications(restaurant_id, type, title, message, severity, reference_id, reference_type)
    VALUES (
      NEW.restaurant_id,
      CASE WHEN NEW.stock_quantity <= (NEW.min_quantity * 0.5) THEN 'inventory_critical' ELSE 'inventory_low' END,
      CASE WHEN NEW.stock_quantity <= (NEW.min_quantity * 0.5) THEN '🚨 Critical Stock: ' ELSE '⚠️ Low Stock: ' END || NEW.name,
      NEW.name || ' is at ' || NEW.stock_quantity || ' ' || NEW.unit || ' (minimum: ' || NEW.min_quantity || ' ' || NEW.unit || ')',
      CASE WHEN NEW.stock_quantity <= (NEW.min_quantity * 0.5) THEN 'critical' ELSE 'high' END,
      NEW.id,
      'inventory_item'
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_inventory_alert() OWNER TO postgres;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: dining_tables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dining_tables (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    label character varying(20) NOT NULL,
    section character varying(50) DEFAULT 'Main'::character varying,
    capacity integer DEFAULT 4 NOT NULL,
    status character varying(20) DEFAULT 'vacant'::character varying,
    position_x integer DEFAULT 0,
    position_y integer DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT dining_tables_status_check CHECK (((status)::text = ANY ((ARRAY['vacant'::character varying, 'occupied'::character varying, 'reserved'::character varying, 'cleaning'::character varying])::text[])))
);


ALTER TABLE public.dining_tables OWNER TO postgres;

--
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    role_id uuid,
    full_name character varying(150) NOT NULL,
    email character varying(150),
    phone character varying(30),
    pin character varying(10),
    password_hash character varying(255),
    salary numeric(10,2),
    status character varying(20) DEFAULT 'active'::character varying,
    avatar_url text,
    joined_date date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT employees_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'on_leave'::character varying])::text[])))
);


ALTER TABLE public.employees OWNER TO postgres;

--
-- Name: gl_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gl_accounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(150) NOT NULL,
    type character varying(30) NOT NULL,
    is_system boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT gl_accounts_type_check CHECK (((type)::text = ANY ((ARRAY['revenue'::character varying, 'cogs'::character varying, 'expense'::character varying, 'asset'::character varying, 'liability'::character varying, 'equity'::character varying])::text[])))
);


ALTER TABLE public.gl_accounts OWNER TO postgres;

--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    name character varying(150) NOT NULL,
    unit character varying(30) NOT NULL,
    stock_quantity numeric(12,3) DEFAULT 0,
    min_quantity numeric(12,3) DEFAULT 0,
    max_quantity numeric(12,3) DEFAULT 100,
    cost_per_unit numeric(10,4) DEFAULT 0,
    supplier character varying(150),
    barcode character varying(100),
    category character varying(100) DEFAULT 'General'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.inventory_items OWNER TO postgres;

--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    employee_id uuid,
    type character varying(30) NOT NULL,
    quantity numeric(12,3) NOT NULL,
    cost_per_unit numeric(10,4),
    total_cost numeric(10,2),
    notes text,
    reference character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT inventory_transactions_type_check CHECK (((type)::text = ANY ((ARRAY['purchase'::character varying, 'usage'::character varying, 'adjustment'::character varying, 'waste'::character varying, 'transfer'::character varying])::text[])))
);


ALTER TABLE public.inventory_transactions OWNER TO postgres;

--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    reference character varying(100),
    description text NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.journal_entries OWNER TO postgres;

--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_lines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    debit numeric(12,2) DEFAULT 0,
    credit numeric(12,2) DEFAULT 0,
    notes text
);


ALTER TABLE public.journal_lines OWNER TO postgres;

--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    category_id uuid,
    name character varying(150) NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    cost numeric(10,2) DEFAULT 0,
    prep_time_min integer DEFAULT 10,
    image_url text,
    is_available boolean DEFAULT true,
    is_popular boolean DEFAULT false,
    tags text[],
    allergens text[],
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.menu_items OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    type character varying(30) NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    severity character varying(20) DEFAULT 'info'::character varying,
    is_read boolean DEFAULT false,
    reference_id uuid,
    reference_type character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_severity_check CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'low'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT notifications_type_check CHECK (((type)::text = ANY ((ARRAY['inventory_low'::character varying, 'inventory_critical'::character varying, 'order_ready'::character varying, 'order_delayed'::character varying, 'system'::character varying, 'shift_reminder'::character varying])::text[])))
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    menu_item_id uuid,
    name character varying(150) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    modifiers jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT order_items_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'cooking'::character varying, 'ready'::character varying, 'served'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    table_id uuid,
    employee_id uuid,
    order_number character varying(20) NOT NULL,
    order_type character varying(20) DEFAULT 'dine_in'::character varying,
    status text DEFAULT 'pending'::character varying,
    source character varying(30) DEFAULT 'pos'::character varying,
    guest_count integer DEFAULT 1,
    subtotal numeric(10,2) DEFAULT 0,
    tax_amount numeric(10,2) DEFAULT 0,
    discount_amount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) DEFAULT 0,
    payment_method character varying(30),
    payment_status text DEFAULT 'unpaid'::character varying,
    customer_name character varying(150),
    customer_phone character varying(30),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    preparing_at timestamp with time zone,
    ready_at timestamp with time zone,
    served_at timestamp with time zone,
    CONSTRAINT orders_order_type_check CHECK (((order_type)::text = ANY ((ARRAY['dine_in'::character varying, 'takeaway'::character varying, 'online'::character varying, 'delivery'::character varying])::text[]))),
    CONSTRAINT orders_payment_status_check CHECK ((payment_status = ANY (ARRAY[('unpaid'::character varying)::text, ('paid'::character varying)::text, ('refunded'::character varying)::text, ('partial'::character varying)::text]))),
    CONSTRAINT orders_source_check CHECK (((source)::text = ANY ((ARRAY['pos'::character varying, 'online'::character varying, 'app'::character varying, 'phone'::character varying])::text[]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('preparing'::character varying)::text, ('ready'::character varying)::text, ('served'::character varying)::text, ('paid'::character varying)::text, ('cancelled'::character varying)::text])))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plans (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(50) NOT NULL,
    price numeric(10,2) NOT NULL,
    max_tables integer DEFAULT 10 NOT NULL,
    max_employees integer DEFAULT 15 NOT NULL,
    features jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.plans OWNER TO postgres;

--
-- Name: recipe_ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recipe_ingredients (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    recipe_id uuid NOT NULL,
    inventory_item_id uuid,
    name character varying(150) NOT NULL,
    quantity numeric(12,4) NOT NULL,
    unit character varying(30) NOT NULL
);


ALTER TABLE public.recipe_ingredients OWNER TO postgres;

--
-- Name: recipes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recipes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    menu_item_id uuid,
    name character varying(150) NOT NULL,
    instructions text,
    prep_time_min integer DEFAULT 10,
    cook_time_min integer DEFAULT 20,
    serves integer DEFAULT 1,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.recipes OWNER TO postgres;

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    employee_id uuid,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- Name: reservations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    table_id uuid,
    guest_name character varying(150) NOT NULL,
    guest_phone character varying(30),
    guest_count integer DEFAULT 1 NOT NULL,
    reserved_at timestamp with time zone NOT NULL,
    duration_min integer DEFAULT 90,
    status character varying(20) DEFAULT 'confirmed'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reservations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'seated'::character varying, 'cancelled'::character varying, 'no_show'::character varying])::text[])))
);


ALTER TABLE public.reservations OWNER TO postgres;

--
-- Name: restaurants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.restaurants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    plan_id uuid,
    name character varying(150) NOT NULL,
    slug character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    phone character varying(30),
    address text,
    city character varying(100),
    country character varying(100) DEFAULT 'Pakistan'::character varying,
    currency character varying(10) DEFAULT 'PKR'::character varying,
    timezone character varying(60) DEFAULT 'Asia/Karachi'::character varying,
    logo_url text,
    status character varying(20) DEFAULT 'trial'::character varying,
    trial_ends_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT restaurants_status_check CHECK (((status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'suspended'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.restaurants OWNER TO postgres;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid,
    name character varying(60) NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb,
    is_system boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- Name: shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shifts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    shift_name character varying(50) NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    date date NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT shifts_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'active'::character varying, 'completed'::character varying, 'absent'::character varying])::text[])))
);


ALTER TABLE public.shifts OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(150) NOT NULL,
    is_super_admin boolean DEFAULT false,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, restaurant_id, name, description, sort_order, is_active, created_at) FROM stdin;
e1000000-0000-0000-0000-000000000001	b1000000-0000-0000-0000-000000000001	Starters	\N	1	t	2026-04-05 12:05:42.032917+00
e1000000-0000-0000-0000-000000000002	b1000000-0000-0000-0000-000000000001	Mains	\N	2	t	2026-04-05 12:05:42.032917+00
e1000000-0000-0000-0000-000000000003	b1000000-0000-0000-0000-000000000001	Desserts	\N	3	t	2026-04-05 12:05:42.032917+00
e1000000-0000-0000-0000-000000000004	b1000000-0000-0000-0000-000000000001	Drinks	\N	4	t	2026-04-05 12:05:42.032917+00
e1000000-0000-0000-0000-000000000005	b1000000-0000-0000-0000-000000000001	Specials	\N	5	t	2026-04-05 12:05:42.032917+00
ad67e45f-ff1d-4cf4-bccd-da3011745377	b1000000-0000-0000-0000-000000000001	Soups	\N	2	t	2026-04-06 12:17:47.327832+00
3370080f-f8f3-4519-9913-8eb6e5406a7d	b1000000-0000-0000-0000-000000000001	Salads	\N	3	t	2026-04-06 12:17:47.327832+00
704010c5-7a07-4732-bd4f-04f9d1ded4aa	b1000000-0000-0000-0000-000000000001	Grills	\N	5	t	2026-04-06 12:17:47.327832+00
b67b36e2-fece-4f6a-89b6-ee792937b19c	b1000000-0000-0000-0000-000000000001	Pasta	\N	6	t	2026-04-06 12:17:47.327832+00
9a7a62e6-0c0c-4d3a-af69-8fb5f8c688c3	b1000000-0000-0000-0000-000000000001	Pizza	\N	7	t	2026-04-06 12:17:47.327832+00
030edb6e-9a5d-4791-9388-cbd5af857012	b1000000-0000-0000-0000-000000000001	Hot Drinks	\N	9	t	2026-04-06 12:17:47.327832+00
db6db173-8cf3-4808-8978-dac128540360	b1000000-0000-0000-0000-000000000001	Cold Drinks	\N	10	t	2026-04-06 12:17:47.327832+00
6991675c-ab60-46c8-8961-6145efe137ec	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Starters	\N	1	t	2026-04-06 12:23:05.46885+00
2d541512-00a0-4174-b52c-d3eb6566a1d8	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Soups	\N	2	t	2026-04-06 12:23:05.46885+00
c86b22d4-0c01-4ad3-aeb1-3b018818edfd	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Salads	\N	3	t	2026-04-06 12:23:05.46885+00
6dc50fbc-4287-4fe0-9821-3ac479822846	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Mains	\N	4	t	2026-04-06 12:23:05.46885+00
c82867dd-ef36-4e03-a540-4012a88f5806	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Grills	\N	5	t	2026-04-06 12:23:05.46885+00
cfdfb4ba-b25d-4379-8bc1-5ca095555f30	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Pasta	\N	6	t	2026-04-06 12:23:05.46885+00
c51adc13-6c8d-4819-9972-b2eec535e8ab	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Pizza	\N	7	t	2026-04-06 12:23:05.46885+00
de95b381-1963-41d1-b198-2fdb4e22828b	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Desserts	\N	8	t	2026-04-06 12:23:05.46885+00
00ffb0a4-c567-409e-bf45-79596954fcb5	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Hot Drinks	\N	9	t	2026-04-06 12:23:05.46885+00
ff3b23be-09eb-4796-b619-9dfaece85788	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Cold Drinks	\N	10	t	2026-04-06 12:23:05.46885+00
\.


--
-- Data for Name: dining_tables; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dining_tables (id, restaurant_id, label, section, capacity, status, position_x, position_y, notes, created_at) FROM stdin;
c69db756-bb95-4f3b-a3f0-dbfe5620908a	b1000000-0000-0000-0000-000000000001	T-04	Main Hall	4	reserved	0	0	\N	2026-04-05 12:05:42.032917+00
e205ec48-9c1c-4c82-9e6c-b5689678cda1	b1000000-0000-0000-0000-000000000001	T-01	Main Hall	4	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
1e5d493c-deca-4953-b621-466ee07d22aa	b1000000-0000-0000-0000-000000000001	T-09	VIP	4	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
94f7b934-f6b4-4605-ba1e-16c48c64b615	b1000000-0000-0000-0000-000000000001	T-03	Main Hall	6	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
b03cc4ec-f641-4850-a7e9-34786838af8d	b1000000-0000-0000-0000-000000000001	T-02	Main Hall	2	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
2684a6b6-6dca-4f5b-a8d7-6618464fd9ec	b1000000-0000-0000-0000-000000000001	T-05	Main Hall	8	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
abe3292b-71cd-4bd9-9ccb-900cfad85180	b1000000-0000-0000-0000-000000000001	T-11	Main Hall	4	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
0742510a-f4d5-4168-bd05-c2a76d34033c	b1000000-0000-0000-0000-000000000001	T-12	Main Hall	2	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
89ab87e0-0a0c-40c1-87f1-3b674f991577	b1000000-0000-0000-0000-000000000001	T-M01	Main Hall	4	vacant	0	0	\N	2026-04-06 12:17:33.232148+00
7f7bbb0e-3bc2-41d7-abd6-5de329c9320e	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-01	Main Hall	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
97f6885d-33b8-4dcf-b63d-3b65cb35abef	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-02	Main Hall	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
976cdcbe-6839-4b3b-9728-b877b40910e8	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-03	Main Hall	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
b444b52f-9585-49c8-b982-0096bbeb3783	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-04	Main Hall	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
27a9cc8a-e327-4937-8e02-81c619f84415	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-05	Main Hall	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
8cbcef4d-a758-4985-8a15-7633eed4407b	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-06	Main Hall	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
3165810a-f00b-41b7-a3b8-3b343796b1d6	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-7	Terrace	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
96349d11-2974-474f-bf5e-ae58f098a779	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-8	Terrace	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
2a6a1da6-99b8-4043-957f-ddd7f9d5ffb9	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-9	Terrace	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
4b17d9e6-29b4-474e-b16d-686b4e3161b2	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-10	Terrace	4	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
b3b408a3-e87f-49f7-a724-60b9b93e8dfa	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-V1	VIP	6	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
f3503ad8-13f4-4aec-8cff-6bbaaafe51fb	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	T-V2	VIP	6	vacant	0	0	\N	2026-04-06 12:23:01.360852+00
4572b2f4-5531-485c-a559-428216863a3d	b1000000-0000-0000-0000-000000000001	T-06	Terrace	2	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
6d0f8075-d156-4930-b5db-5f7eaf22e11e	b1000000-0000-0000-0000-000000000001	T-08	Terrace	6	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
c9da8599-6457-4be3-a89a-37a949ae24cc	b1000000-0000-0000-0000-000000000001	T-10	VIP	10	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
039ec16f-6079-40fb-9600-863372d68c6d	b1000000-0000-0000-0000-000000000001	T-07	Terrace	4	vacant	0	0	\N	2026-04-05 12:05:42.032917+00
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employees (id, restaurant_id, role_id, full_name, email, phone, pin, password_hash, salary, status, avatar_url, joined_date, created_at, updated_at) FROM stdin;
d1000000-0000-0000-0000-000000000001	b1000000-0000-0000-0000-000000000001	c1000000-0000-0000-0000-000000000001	Ahmed Khan	ahmed@goldenfork.com	+92-300-1111111	1234	$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG	85000.00	active	\N	2023-01-15	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
d1000000-0000-0000-0000-000000000002	b1000000-0000-0000-0000-000000000001	c1000000-0000-0000-0000-000000000002	Maya Chen	maya@goldenfork.com	+92-300-2222222	2345	$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG	45000.00	active	\N	2023-03-01	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
d1000000-0000-0000-0000-000000000003	b1000000-0000-0000-0000-000000000001	c1000000-0000-0000-0000-000000000003	Jake Morrison	jake@goldenfork.com	+92-300-3333333	3456	$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG	35000.00	active	\N	2023-06-01	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
d1000000-0000-0000-0000-000000000004	b1000000-0000-0000-0000-000000000001	c1000000-0000-0000-0000-000000000004	Tom Baker	tom@goldenfork.com	+92-300-4444444	4567	$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG	70000.00	active	\N	2023-02-01	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
d1000000-0000-0000-0000-000000000005	b1000000-0000-0000-0000-000000000001	c1000000-0000-0000-0000-000000000005	Nina Frost	nina@goldenfork.com	+92-300-5555555	5678	$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG	30000.00	active	\N	2023-07-01	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
05d9a3a6-2de3-49fb-9951-76d442783bf9	b1000000-0000-0000-0000-000000000001	c1000000-0000-0000-0000-000000000005	Tahir	tahir@gmail.com	\N	\N	$2a$10$T1TwhWtE2UK6CEr34XtUGeqAJKuUMf2f8w3ClC/IXLkfiYBdsUzhS	\N	active	\N	2026-04-06	2026-04-06 12:18:34.327872+00	2026-04-06 12:18:34.327872+00
ad572ffe-3190-4af0-b248-ca14e7b8d6eb	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	5f44be52-c308-4bac-9b2b-0edad8ed74f7	Admin	pace@gmail.com	\N	1234	$2a$10$.KAzmNTSR29Mphn8ppPlq.S1pAPH8nXbnchfz.TuvYYJew8pNzsMm	\N	active	\N	2026-04-06	2026-04-06 12:22:45.254086+00	2026-04-06 12:22:45.254086+00
59dfdcc4-0112-4098-843d-214294c1803e	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	ab9e9f12-8f84-4f52-8573-fe99c5accf17	Ahmed	ahmed@pace.com	\N	\N	$2a$10$Prz7VqTzhHPk8QJ/S23NY.WRVvM.S3nYRfbC83LxqL7rz0M2iyKuO	\N	active	\N	2026-04-06	2026-04-06 12:28:39.860202+00	2026-04-06 12:28:39.860202+00
7446cfa1-a53f-46c9-9cb1-09d69d018831	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	5b9292cf-8afe-42bb-ae85-1519055dce22	Mansoor	mansoor@pace.com	\N	\N	$2a$10$6AuJ59vxZTa2IurqEedRI.4Kr6vDic7EsFFJFuKmLftQn.sUQe73O	\N	active	\N	2026-04-06	2026-04-06 12:28:39.954086+00	2026-04-06 12:28:39.954086+00
709db6d9-88c6-4988-987c-ddb4a9125c2a	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	74cc15f9-d411-4b5b-96c5-39097af5cc2b	Ali	ali@pace.com	\N	\N	$2a$10$QRbgSmADHSmnxPWhpgaWRO8M/OJddBOANZKlV4pjqAS/br2kwbPz.	\N	active	\N	2026-04-06	2026-04-06 12:28:40.065003+00	2026-04-06 12:28:40.065003+00
52856c64-a9c2-4e11-9fd5-f414f6942733	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	edc5a840-48a9-4773-a191-993ab78720f4	Talha	talha@pace.com	\N	\N	$2a$10$qJdTDx17YDJnvYQ0UP64TO0XqW4yEL6OfqynFhcw451nLQHjqcV5y	\N	active	\N	2026-04-06	2026-04-06 12:28:40.154759+00	2026-04-06 12:28:40.154759+00
\.


--
-- Data for Name: gl_accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.gl_accounts (id, restaurant_id, code, name, type, is_system, created_at) FROM stdin;
4fa05208-7b49-4378-bfd7-e927c5e20677	b1000000-0000-0000-0000-000000000001	4001	Food Revenue	revenue	t	2026-04-05 12:05:42.032917+00
5b482d78-b6e9-49d3-a344-2371deba628a	b1000000-0000-0000-0000-000000000001	4002	Beverage Revenue	revenue	t	2026-04-05 12:05:42.032917+00
bb4db728-34e7-425c-9b78-7f8db449f3dc	b1000000-0000-0000-0000-000000000001	4003	Online Revenue	revenue	t	2026-04-05 12:05:42.032917+00
7b2ed56e-fb0f-4b2c-ab8d-ca4c79e4a7ea	b1000000-0000-0000-0000-000000000001	5001	Food Cost	cogs	t	2026-04-05 12:05:42.032917+00
951c7514-8cb9-4307-9ac9-1e1d7cd9a906	b1000000-0000-0000-0000-000000000001	5002	Beverage Cost	cogs	t	2026-04-05 12:05:42.032917+00
210575b7-505d-4a6e-a539-4537a22e3cd4	b1000000-0000-0000-0000-000000000001	6001	Staff Wages	expense	t	2026-04-05 12:05:42.032917+00
13851bb7-fbac-49b5-b752-51929a299d8b	b1000000-0000-0000-0000-000000000001	6002	Rent & Utilities	expense	t	2026-04-05 12:05:42.032917+00
9f229fd4-3aeb-4c28-b2e4-30a2c020c770	b1000000-0000-0000-0000-000000000001	6003	Supplies	expense	t	2026-04-05 12:05:42.032917+00
ce79b906-ed6f-4dcd-8e20-c2c338882894	b1000000-0000-0000-0000-000000000001	1001	Cash on Hand	asset	t	2026-04-05 12:05:42.032917+00
fa71c9c3-cff2-4b4f-b388-2a52c7d74307	b1000000-0000-0000-0000-000000000001	1002	Bank Account	asset	t	2026-04-05 12:05:42.032917+00
dbbd46ae-32b2-42cb-ae73-c19cd9be4723	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	4001	Food Revenue	revenue	t	2026-04-06 12:22:45.254086+00
d82272ad-29ec-4fab-833a-398ddee72f0e	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	4002	Beverage Revenue	revenue	t	2026-04-06 12:22:45.254086+00
d2a3481d-2fbb-4fa3-bc6a-86f8c8e6cb21	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	4003	Online Revenue	revenue	t	2026-04-06 12:22:45.254086+00
6e06922c-733f-4916-8a58-f8d52e6d3c9b	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	5001	Food Cost	cogs	t	2026-04-06 12:22:45.254086+00
97135d69-0f3a-4760-8fd3-1bf695663ffa	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	5002	Beverage Cost	cogs	t	2026-04-06 12:22:45.254086+00
82640795-5573-4ae2-a195-af597547f769	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	6001	Staff Wages	expense	t	2026-04-06 12:22:45.254086+00
dea84df2-ac86-403e-9244-a2cb0d293576	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	6002	Rent & Utilities	expense	t	2026-04-06 12:22:45.254086+00
9a79d02e-9849-4234-ae62-cf740a408b31	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	6003	Supplies	expense	t	2026-04-06 12:22:45.254086+00
090342d5-dc1c-4c96-8b02-63cc386b63c1	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	1001	Cash on Hand	asset	t	2026-04-06 12:22:45.254086+00
3cf22f4f-d2b2-4233-ab5f-8ee90a5cbdf7	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	1002	Bank Account	asset	t	2026-04-06 12:22:45.254086+00
\.


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_items (id, restaurant_id, name, unit, stock_quantity, min_quantity, max_quantity, cost_per_unit, supplier, barcode, category, created_at, updated_at) FROM stdin;
9a000000-0000-0000-0000-000000000001	b1000000-0000-0000-0000-000000000001	Beef (Ribeye)	kg	4.200	5.000	20.000	2800.0000	Premier Meats Karachi	\N	Protein	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000002	b1000000-0000-0000-0000-000000000001	Wild Mushrooms	kg	2.800	2.000	10.000	350.0000	Fresh Farms	\N	Produce	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000003	b1000000-0000-0000-0000-000000000001	Atlantic Salmon	kg	1.200	3.000	12.000	1800.0000	Sea Fresh Co.	\N	Seafood	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000004	b1000000-0000-0000-0000-000000000001	Heavy Cream	L	8.500	4.000	15.000	220.0000	Dairy Direct	\N	Dairy	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000005	b1000000-0000-0000-0000-000000000001	Truffle Oil	L	0.400	0.500	2.000	12000.0000	Gourmet Imports	\N	Condiments	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000006	b1000000-0000-0000-0000-000000000001	Arborio Rice	kg	12.000	5.000	20.000	180.0000	Italian Foods PK	\N	Dry Goods	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000007	b1000000-0000-0000-0000-000000000001	Duck Legs	pcs	14.000	10.000	40.000	750.0000	Premier Meats Karachi	\N	Protein	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000008	b1000000-0000-0000-0000-000000000001	Tiger Prawns	kg	3.800	3.000	12.000	2200.0000	Sea Fresh Co.	\N	Seafood	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000009	b1000000-0000-0000-0000-000000000001	Parmesan	kg	2.500	1.000	5.000	1800.0000	Italian Foods PK	\N	Dairy	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000010	b1000000-0000-0000-0000-000000000001	Butter	kg	5.000	2.000	10.000	450.0000	Dairy Direct	\N	Dairy	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000011	b1000000-0000-0000-0000-000000000001	Eggs	pcs	48.000	24.000	120.000	20.0000	Local Farm	\N	Dairy	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9a000000-0000-0000-0000-000000000012	b1000000-0000-0000-0000-000000000001	All-Purpose Flour	kg	10.000	5.000	25.000	80.0000	Flour Mills PK	\N	Dry Goods	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
\.


--
-- Data for Name: inventory_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_transactions (id, restaurant_id, inventory_item_id, employee_id, type, quantity, cost_per_unit, total_cost, notes, reference, created_at) FROM stdin;
\.


--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_entries (id, restaurant_id, reference, description, entry_date, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: journal_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_lines (id, entry_id, account_id, debit, credit, notes) FROM stdin;
\.


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.menu_items (id, restaurant_id, category_id, name, description, price, cost, prep_time_min, image_url, is_available, is_popular, tags, allergens, sort_order, created_at, updated_at) FROM stdin;
f1000000-0000-0000-0000-000000000010	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000004	House Red Wine (glass)	Cabernet Sauvignon, smooth and full-bodied	1100.00	280.00	2	\N	t	f	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
f1000000-0000-0000-0000-000000000009	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000003	Chocolate Fondant	Warm dark chocolate cake with vanilla ice cream	1400.00	350.00	15	/uploads/85bda5a2f8505c766312413d4c979185.jpg	t	f	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:20:57.372444+00
f1000000-0000-0000-0000-000000000002	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000001	Burrata Caprese	Fresh burrata with heirloom tomatoes and basil	1600.00	500.00	8	/uploads/8ac220e8b6218f596263616b38d66882.jpg	t	f	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:13:41.958949+00
f1000000-0000-0000-0000-000000000003	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000001	Prawn Cocktail	Tiger prawns with Marie Rose sauce and avocado	1800.00	600.00	10	/uploads/f94922a98e6e0da18961464e03ccfb47.jpg	t	t	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:15:16.403535+00
f1000000-0000-0000-0000-000000000008	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000003	Crème Brûlée	Classic vanilla custard with caramelised sugar crust	1200.00	300.00	5	/uploads/bd81e8fc29d0b13ae1009f1a368f63cd.webp	t	t	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:21:31.440534+00
f1000000-0000-0000-0000-000000000001	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000001	Truffle Arancini	Crispy risotto balls with truffle oil and mozzarella	1400.00	400.00	12	/uploads/8cf5a3ddc30acb5e766660b4f78ca19f.webp	t	t	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:16:56.191079+00
f1000000-0000-0000-0000-000000000004	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000002	Beef Ribeye 250g	Prime beef ribeye with herb butter and fries	6800.00	2500.00	22	/uploads/ce3d438821effe9f938b752545a8ee5c.jpg	t	t	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:17:35.002892+00
f1000000-0000-0000-0000-000000000011	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000004	Craft Beer	Local IPA, hoppy and refreshing	800.00	200.00	2	/uploads/2ddceda23a16330d2a8f543bdb637479.png	t	f	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:22:16.067175+00
a82efa10-ec00-453e-88fa-97a177d32d5f	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000002	Chicken Burger	\N	1200.00	0.00	15	/uploads/f1aa7c9e1c6ea08775b17b4bc9b5f77b.jpg	t	f	{}	{}	0	2026-04-06 12:18:12.886375+00	2026-04-06 13:18:26.643287+00
f1000000-0000-0000-0000-000000000007	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000002	Duck Confit	Slow-cooked duck leg with lentils and red wine jus	4200.00	1400.00	25	/uploads/f9716c9fbb57d76a535917aa9540fca8.webp	t	t	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:19:00.285733+00
f1000000-0000-0000-0000-000000000012	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000004	Fresh Lemonade	Hand-squeezed with mint and sea salt	600.00	80.00	3	/uploads/9982a98ce1ede894f7ccb1c2edcb938f.jpg	t	f	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:23:04.048371+00
f1000000-0000-0000-0000-000000000005	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000002	Pan-Seared Salmon	Atlantic salmon with capers, lemon and wilted spinach	3400.00	1100.00	18	/uploads/140b0b355a4e4ed394346a0e6ba48a43.webp	t	f	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:19:35.671291+00
f1000000-0000-0000-0000-000000000006	b1000000-0000-0000-0000-000000000001	e1000000-0000-0000-0000-000000000002	Wild Mushroom Risotto	Arborio rice with mixed wild mushrooms and parmesan	2800.00	800.00	20	/uploads/2c74da714658052592bef5d04ce28437.webp	t	f	\N	\N	0	2026-04-05 12:05:42.032917+00	2026-04-06 13:20:12.000649+00
cf9935e9-4e99-4e6e-bc4e-8d035f14b2c5	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	6dc50fbc-4287-4fe0-9821-3ac479822846	Chicken Burger	\N	1200.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:39.953065+00	2026-04-06 12:27:39.953065+00
7c4a3404-ea5b-4f53-a22c-cb24b4481dfe	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	6dc50fbc-4287-4fe0-9821-3ac479822846	Beef Burger	\N	2000.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:39.965022+00	2026-04-06 12:27:39.965022+00
1d405bf4-029e-4437-a92f-62e1e4b73879	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	2d541512-00a0-4174-b52c-d3eb6566a1d8	Chicken Corn Soup	\N	500.00	0.00	10	\N	t	f	{}	{}	0	2026-04-06 12:27:39.976361+00	2026-04-06 12:27:39.976361+00
ea443567-15d2-46ea-8271-49740dc6f7ce	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	6991675c-ab60-46c8-8961-6145efe137ec	Chicken rolls	\N	800.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:39.988219+00	2026-04-06 12:27:39.988219+00
fe9c3db5-97a4-4cbd-bcea-2cc45a3d1011	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	6dc50fbc-4287-4fe0-9821-3ac479822846	Beef Biryani	\N	800.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.005269+00	2026-04-06 12:27:40.005269+00
f8b69820-2f37-44b7-b308-b41c98eeb9bb	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	c86b22d4-0c01-4ad3-aeb1-3b018818edfd	Ceaser Salad	\N	900.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.022162+00	2026-04-06 12:27:40.022162+00
5ea8e80c-8963-4cb0-881e-f34ffdf1f136	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	c86b22d4-0c01-4ad3-aeb1-3b018818edfd	Green Salad	\N	500.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.03898+00	2026-04-06 12:27:40.03898+00
e78599ad-5bc1-42d5-812c-839ef4eceb1a	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	6dc50fbc-4287-4fe0-9821-3ac479822846	Chicken Biryani	\N	600.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.055746+00	2026-04-06 12:27:40.055746+00
872a8750-30af-42d4-94d0-be1aae747972	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	c82867dd-ef36-4e03-a540-4012a88f5806	Chicken Tikka	\N	800.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.070153+00	2026-04-06 12:27:40.070153+00
0ced468f-3442-4e87-8936-e9ebaf5c97fb	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	c51adc13-6c8d-4819-9972-b2eec535e8ab	Pizza	\N	1500.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.091525+00	2026-04-06 12:27:40.091525+00
5bb31200-d8c8-47d5-9a4e-c6c3f15bea47	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	cfdfb4ba-b25d-4379-8bc1-5ca095555f30	Pasta	\N	1500.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.109694+00	2026-04-06 12:27:40.109694+00
54621191-2488-4304-a53e-ac6686afe5d8	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	de95b381-1963-41d1-b198-2fdb4e22828b	Ice cream	\N	500.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.123872+00	2026-04-06 12:27:40.123872+00
62f0212a-2753-4637-af81-ba91d174c660	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	ff3b23be-09eb-4796-b619-9dfaece85788	Pepsi	\N	100.00	0.00	1	\N	t	f	{}	{}	0	2026-04-06 12:27:40.135619+00	2026-04-06 12:27:40.135619+00
db3fb400-2cce-4984-91ff-c749af573f99	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	ff3b23be-09eb-4796-b619-9dfaece85788	Coke	\N	100.00	0.00	1	\N	t	f	{}	{}	0	2026-04-06 12:27:40.146258+00	2026-04-06 12:27:40.146258+00
dfe69043-e556-416a-a236-9e91bbc43902	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	ff3b23be-09eb-4796-b619-9dfaece85788	Sprite	\N	100.00	0.00	1	\N	t	f	{}	{}	0	2026-04-06 12:27:40.155744+00	2026-04-06 12:27:40.155744+00
d5bd25df-98a3-4609-b454-a8b6881d40d4	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	00ffb0a4-c567-409e-bf45-79596954fcb5	Coffee	\N	500.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.167972+00	2026-04-06 12:27:40.167972+00
4fea70fd-2e64-432e-bdf8-304222267ba9	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	00ffb0a4-c567-409e-bf45-79596954fcb5	Tea	\N	500.00	0.00	15	\N	t	f	{}	{}	0	2026-04-06 12:27:40.177951+00	2026-04-06 12:27:40.177951+00
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, restaurant_id, type, title, message, severity, is_read, reference_id, reference_type, created_at) FROM stdin;
2a819351-2b1f-4b73-8b51-05849cafcb77	b1000000-0000-0000-0000-000000000001	inventory_critical	🚨 Critical Stock: Atlantic Salmon	Atlantic Salmon is at 1.2 kg (minimum: 3 kg). Please reorder immediately.	critical	f	\N	\N	2026-04-05 12:05:42.032917+00
847ab95e-180a-4dd1-b4c7-31b567ee1dbd	b1000000-0000-0000-0000-000000000001	inventory_critical	🚨 Critical Stock: Truffle Oil	Truffle Oil is at 0.4 L (minimum: 0.5 L). Please reorder immediately.	critical	f	\N	\N	2026-04-05 12:05:42.032917+00
ec2bbea5-e9cd-4249-b3ce-61ed82755361	b1000000-0000-0000-0000-000000000001	inventory_low	⚠️ Low Stock: Beef (Ribeye)	Beef (Ribeye) is at 4.2 kg (minimum: 5 kg). Consider reordering soon.	high	f	\N	\N	2026-04-05 12:05:42.032917+00
d14bd08c-47cf-4962-b0a1-c15eb7d54812	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready: ORD-1043	Table T-03 order is ready for service.	info	f	\N	\N	2026-04-05 12:05:42.032917+00
c0535075-116a-4f53-a56b-2efd98dcc237	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1007 is ready for service.	info	f	1f4a56a8-e2ba-43c7-b806-823898cea1d4	order	2026-04-05 12:35:56.488175+00
006f9dea-c327-455f-896c-a4c89fe76783	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1006 is ready for service.	info	f	78fa2576-dd6e-4f86-b163-362cf3c79ff2	order	2026-04-05 12:35:57.822083+00
78c264b1-7338-435f-9676-fc5ae006999f	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1005 is ready for service.	info	f	a1388da4-5206-4859-ab90-15b63caa3887	order	2026-04-05 12:36:22.005572+00
34ca19ab-a903-472c-8aa7-162390e86854	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1042 is ready for service.	info	f	9c000000-0000-0000-0000-000000000001	order	2026-04-05 12:35:59.779872+00
6f71f5f1-6d5a-4646-aa9b-cdcaef9b4679	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1009 is ready for service.	info	f	e1604c4c-aa7e-4254-ad62-8215ebe0cd62	order	2026-04-05 13:19:20.329677+00
af0430fa-46d4-41ab-82f8-79987e589c88	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1008 is ready for service.	info	f	d10f5180-36aa-4a65-a3b7-acf543680748	order	2026-04-05 13:19:21.429473+00
c1fdfa22-d072-4a8e-896b-5fb6021d6a5a	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-ONLINE-08 is ready for service.	info	f	9c000000-0000-0000-0000-000000000004	order	2026-04-05 13:19:22.161696+00
162ce2b0-e2cd-45fb-a459-4253aeccc172	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1012 is ready for service.	info	f	b7d44922-1f54-459e-937a-8c725c8345ac	order	2026-04-05 14:30:30.057045+00
48ba0c27-2576-485f-8eda-a0a863f6a871	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1011 is ready for service.	info	f	806fe216-614d-4c50-a664-c558303f75dc	order	2026-04-05 14:30:32.461141+00
340119a1-74dd-4c02-a398-0d388b164e7e	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1010 is ready for service.	info	f	bd1f7f27-100e-4188-94ae-6b29b79c8c1a	order	2026-04-05 14:30:14.441911+00
70d06841-b6a7-4e77-8cff-e26072193b3a	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1013 is ready for service.	info	f	d6885b17-51c4-4f8e-8e97-a74be1bd7acf	order	2026-04-07 08:34:21.153686+00
7c22c10f-9ce0-4173-a4f5-6f1666866c22	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1014 is ready for service.	info	f	392a7699-f3e8-4d31-9402-e409f9fa9c07	order	2026-04-07 08:36:33.34234+00
72d5f626-fbec-4d88-b0f7-53a0f41d4017	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1015 is ready for service.	info	f	42f65f07-0332-437c-86e1-2342643a87e1	order	2026-04-07 08:37:42.689134+00
c5c4c88d-b040-4d9f-8e8a-b1f2f011dc71	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1016 is ready for service.	info	f	fa71fa1d-de84-4038-9b44-e85f2cd57ab6	order	2026-04-07 08:38:46.429209+00
7d644393-082b-4295-83de-7ed2b4ba92a2	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1017 is ready for service.	info	f	957abaca-2a83-409f-b899-805e109a5ef6	order	2026-04-07 08:43:00.363048+00
9e7d9b8a-8ff9-425f-b5f5-b9184b14ea9c	b1000000-0000-0000-0000-000000000001	order_ready	✅ Order Ready	Order ORD-1018 is ready for service.	info	f	6f4385e0-c259-4832-916d-a4dcc7938264	order	2026-04-08 07:53:16.455118+00
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, menu_item_id, name, quantity, unit_price, total_price, status, modifiers, notes, created_at) FROM stdin;
6e655e0f-ae4b-43eb-8d28-72e05c913594	9c000000-0000-0000-0000-000000000001	f1000000-0000-0000-0000-000000000004	Beef Ribeye 250g	2	6800.00	13600.00	cooking	[]	\N	2026-04-05 12:05:42.032917+00
98fd8e5e-4d56-43a9-b6fa-6e18f3ce12d1	9c000000-0000-0000-0000-000000000001	f1000000-0000-0000-0000-000000000001	Truffle Arancini	1	1400.00	1400.00	cooking	[]	\N	2026-04-05 12:05:42.032917+00
3c7ca5a0-3112-4e4d-8101-e2f43e59c6e3	9c000000-0000-0000-0000-000000000002	f1000000-0000-0000-0000-000000000005	Pan-Seared Salmon	3	3400.00	10200.00	ready	[]	\N	2026-04-05 12:05:42.032917+00
b0b76eac-d42f-4749-91cf-a2a3b4ccaa8e	9c000000-0000-0000-0000-000000000002	f1000000-0000-0000-0000-000000000006	Wild Mushroom Risotto	2	2800.00	5600.00	ready	[]	\N	2026-04-05 12:05:42.032917+00
4f6cf46b-2cf5-4d16-83cf-5406a237f799	9c000000-0000-0000-0000-000000000003	f1000000-0000-0000-0000-000000000007	Duck Confit	2	4200.00	8400.00	served	[]	\N	2026-04-05 12:05:42.032917+00
d5573798-7deb-4e5c-8a41-74328735f651	9c000000-0000-0000-0000-000000000003	f1000000-0000-0000-0000-000000000008	Crème Brûlée	2	1200.00	2400.00	served	[]	\N	2026-04-05 12:05:42.032917+00
f6e71818-9f81-4a60-ac9f-b5953eeb341a	9c000000-0000-0000-0000-000000000004	f1000000-0000-0000-0000-000000000004	Beef Ribeye 250g	1	6800.00	6800.00	pending	[]	\N	2026-04-05 12:05:42.032917+00
6ba4787f-6883-4d5a-b954-a78e94c44086	9c000000-0000-0000-0000-000000000004	f1000000-0000-0000-0000-000000000010	House Red Wine (glass)	2	1100.00	2200.00	pending	[]	\N	2026-04-05 12:05:42.032917+00
2b4e4a3b-68db-4e4b-afda-6179c46dec96	a1388da4-5206-4859-ab90-15b63caa3887	f1000000-0000-0000-0000-000000000002	Burrata Caprese	1	1600.00	1600.00	pending	[]	\N	2026-04-05 12:12:40.055775+00
627964ba-6d39-4855-b8b2-adc1d7148d38	78fa2576-dd6e-4f86-b163-362cf3c79ff2	f1000000-0000-0000-0000-000000000009	Chocolate Fondant	1	1400.00	1400.00	pending	[]	\N	2026-04-05 12:12:46.040403+00
900e690e-51aa-4677-ab05-38915b9cb0c4	1f4a56a8-e2ba-43c7-b806-823898cea1d4	f1000000-0000-0000-0000-000000000002	Burrata Caprese	1	1600.00	1600.00	pending	[]	\N	2026-04-05 12:20:45.21029+00
799f2255-da59-4bc2-a29d-e8663c56b2ae	1f4a56a8-e2ba-43c7-b806-823898cea1d4	f1000000-0000-0000-0000-000000000003	Prawn Cocktail	1	1800.00	1800.00	pending	[]	\N	2026-04-05 12:20:45.21029+00
4dfafe17-9d40-4067-9259-ce23201bbd1b	1f4a56a8-e2ba-43c7-b806-823898cea1d4	f1000000-0000-0000-0000-000000000001	Truffle Arancini	1	1400.00	1400.00	pending	[]	\N	2026-04-05 12:20:45.21029+00
997ab6a1-8303-4035-b37e-913cd54ac45d	d10f5180-36aa-4a65-a3b7-acf543680748	f1000000-0000-0000-0000-000000000011	Craft Beer	1	800.00	800.00	pending	[]	\N	2026-04-05 13:08:41.905569+00
5efd4b9b-0759-4b6e-8456-dd49fb2d2919	d10f5180-36aa-4a65-a3b7-acf543680748	f1000000-0000-0000-0000-000000000012	Fresh Lemonade	1	600.00	600.00	pending	[]	\N	2026-04-05 13:08:41.905569+00
94f8d7f9-8002-480b-bdd5-6221ea184290	e1604c4c-aa7e-4254-ad62-8215ebe0cd62	f1000000-0000-0000-0000-000000000002	Burrata Caprese	1	1600.00	1600.00	pending	[]	\N	2026-04-05 13:19:12.80853+00
34e29918-e5d1-46f6-9d9f-4bcc83d1b5d8	e1604c4c-aa7e-4254-ad62-8215ebe0cd62	f1000000-0000-0000-0000-000000000003	Prawn Cocktail	1	1800.00	1800.00	pending	[]	\N	2026-04-05 13:19:12.80853+00
7c799cad-8d1d-4afb-85dc-87dd902781eb	bd1f7f27-100e-4188-94ae-6b29b79c8c1a	f1000000-0000-0000-0000-000000000003	Prawn Cocktail	1	1800.00	1800.00	pending	[]	\N	2026-04-05 13:21:51.372765+00
509bdec5-4b2f-4934-ab02-4837a00ab808	bd1f7f27-100e-4188-94ae-6b29b79c8c1a	f1000000-0000-0000-0000-000000000001	Truffle Arancini	1	1400.00	1400.00	pending	[]	\N	2026-04-05 13:21:51.372765+00
77a45bd6-1f97-4909-bc27-f39f91ebf2e8	806fe216-614d-4c50-a664-c558303f75dc	f1000000-0000-0000-0000-000000000001	Truffle Arancini	1	1400.00	1400.00	pending	[]	\N	2026-04-05 13:22:04.452114+00
bf692606-4cea-4f4a-9aed-01dff3230c24	806fe216-614d-4c50-a664-c558303f75dc	f1000000-0000-0000-0000-000000000004	Beef Ribeye 250g	1	6800.00	6800.00	pending	[]	\N	2026-04-05 13:22:04.452114+00
d3ad2cdb-efbe-4410-afb3-d0c1b98858d9	b7d44922-1f54-459e-937a-8c725c8345ac	f1000000-0000-0000-0000-000000000002	Burrata Caprese	1	1600.00	1600.00	pending	[]	\N	2026-04-05 14:29:14.872358+00
7bbc25c3-6655-4b42-be6e-3f2519dc3039	b7d44922-1f54-459e-937a-8c725c8345ac	f1000000-0000-0000-0000-000000000003	Prawn Cocktail	1	1800.00	1800.00	pending	[]	\N	2026-04-05 14:29:14.872358+00
7e064251-f044-4d0e-baf9-9cf069e9475f	b7d44922-1f54-459e-937a-8c725c8345ac	f1000000-0000-0000-0000-000000000004	Beef Ribeye 250g	1	6800.00	6800.00	pending	[]	\N	2026-04-05 14:29:14.872358+00
9b380d4d-eaa4-4665-8efd-63330862a445	d6885b17-51c4-4f8e-8e97-a74be1bd7acf	f1000000-0000-0000-0000-000000000009	Chocolate Fondant	1	1400.00	1400.00	pending	[]	\N	2026-04-07 08:34:08.523287+00
6fe482b2-2687-47c9-9c46-990d668f9b2f	d6885b17-51c4-4f8e-8e97-a74be1bd7acf	f1000000-0000-0000-0000-000000000012	Fresh Lemonade	1	600.00	600.00	pending	[]	\N	2026-04-07 08:34:08.523287+00
4b6f11e0-e769-488e-a13d-7cfa32d6ff65	392a7699-f3e8-4d31-9402-e409f9fa9c07	f1000000-0000-0000-0000-000000000002	Burrata Caprese	1	1600.00	1600.00	pending	[]	\N	2026-04-07 08:36:23.738352+00
692523a4-db26-47c0-977a-05b7dc78771c	392a7699-f3e8-4d31-9402-e409f9fa9c07	f1000000-0000-0000-0000-000000000003	Prawn Cocktail	1	1800.00	1800.00	pending	[]	\N	2026-04-07 08:36:23.738352+00
532df097-dd1c-4386-8435-0ff84ec87b3e	42f65f07-0332-437c-86e1-2342643a87e1	f1000000-0000-0000-0000-000000000001	Truffle Arancini	1	1400.00	1400.00	pending	[]	\N	2026-04-07 08:37:36.323579+00
2ab4d979-ae39-4608-aadf-562243749938	fa71fa1d-de84-4038-9b44-e85f2cd57ab6	a82efa10-ec00-453e-88fa-97a177d32d5f	Chicken Burger	1	1200.00	1200.00	pending	[]	\N	2026-04-07 08:38:34.942197+00
91b417fa-7878-4ca8-89e9-c8345f9ddedd	fa71fa1d-de84-4038-9b44-e85f2cd57ab6	f1000000-0000-0000-0000-000000000007	Duck Confit	1	4200.00	4200.00	pending	[]	\N	2026-04-07 08:38:34.942197+00
3bd15d6a-18fe-4ace-a31b-0645aa335733	957abaca-2a83-409f-b899-805e109a5ef6	f1000000-0000-0000-0000-000000000002	Burrata Caprese	1	1600.00	1600.00	pending	[]	\N	2026-04-07 08:42:52.988973+00
2af3a4cd-d2d0-4383-bae6-ed109e8ad622	957abaca-2a83-409f-b899-805e109a5ef6	f1000000-0000-0000-0000-000000000003	Prawn Cocktail	1	1800.00	1800.00	pending	[]	\N	2026-04-07 08:42:52.988973+00
ce7844ec-f3ac-4b38-a948-7c5683d9cea6	6f4385e0-c259-4832-916d-a4dcc7938264	f1000000-0000-0000-0000-000000000002	Burrata Caprese	1	1600.00	1600.00	pending	[]	\N	2026-04-08 06:04:21.680172+00
3f89fa19-4a68-413f-8c25-fca5cd9e7f19	6f4385e0-c259-4832-916d-a4dcc7938264	f1000000-0000-0000-0000-000000000004	Beef Ribeye 250g	1	6800.00	6800.00	pending	[]	\N	2026-04-08 06:04:21.680172+00
3543ae7c-2760-4778-9030-9ba833c6ec70	6f4385e0-c259-4832-916d-a4dcc7938264	f1000000-0000-0000-0000-000000000012	Fresh Lemonade	1	600.00	600.00	pending	[]	\N	2026-04-08 06:04:21.680172+00
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, restaurant_id, table_id, employee_id, order_number, order_type, status, source, guest_count, subtotal, tax_amount, discount_amount, total_amount, payment_method, payment_status, customer_name, customer_phone, notes, created_at, updated_at, preparing_at, ready_at, served_at) FROM stdin;
9c000000-0000-0000-0000-000000000003	b1000000-0000-0000-0000-000000000001	\N	d1000000-0000-0000-0000-000000000003	ORD-1044	dine_in	paid	pos	2	28400.00	2272.00	0.00	30672.00	\N	paid	\N	\N	\N	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00	\N	\N	\N
957abaca-2a83-409f-b899-805e109a5ef6	b1000000-0000-0000-0000-000000000001	e205ec48-9c1c-4c82-9e6c-b5689678cda1	d1000000-0000-0000-0000-000000000001	ORD-1017	dine_in	paid	pos	1	3400.00	272.00	0.00	3672.00	cash	paid	\N	\N	\N	2026-04-07 08:42:52.988973+00	2026-04-07 08:43:09.677427+00	\N	\N	\N
6f4385e0-c259-4832-916d-a4dcc7938264	b1000000-0000-0000-0000-000000000001	e205ec48-9c1c-4c82-9e6c-b5689678cda1	d1000000-0000-0000-0000-000000000001	ORD-1018	dine_in	paid	pos	1	9000.00	720.00	0.00	9720.00	cash	paid	\N	\N	\N	2026-04-08 06:04:21.680172+00	2026-04-08 07:54:05.1868+00	2026-04-08 07:52:58.678638+00	2026-04-08 07:53:16.451258+00	2026-04-08 07:53:23.26646+00
d10f5180-36aa-4a65-a3b7-acf543680748	b1000000-0000-0000-0000-000000000001	\N	d1000000-0000-0000-0000-000000000001	ORD-1008	takeaway	served	pos	1	1400.00	112.00	0.00	1512.00	\N	unpaid	\N	\N	\N	2026-04-05 13:08:41.905569+00	2026-04-05 14:29:25.834736+00	\N	\N	\N
9c000000-0000-0000-0000-000000000001	b1000000-0000-0000-0000-000000000001	\N	d1000000-0000-0000-0000-000000000002	ORD-1042	dine_in	served	pos	3	15200.00	1216.00	0.00	16416.00	\N	unpaid	\N	\N	\N	2026-04-05 12:05:42.032917+00	2026-04-05 14:29:26.386839+00	\N	\N	\N
9c000000-0000-0000-0000-000000000002	b1000000-0000-0000-0000-000000000001	\N	d1000000-0000-0000-0000-000000000003	ORD-1043	dine_in	served	pos	5	19600.00	1568.00	0.00	21168.00	\N	unpaid	\N	\N	\N	2026-04-05 12:05:42.032917+00	2026-04-05 14:29:26.954934+00	\N	\N	\N
9c000000-0000-0000-0000-000000000004	b1000000-0000-0000-0000-000000000001	\N	\N	ORD-ONLINE-08	online	served	pos	1	8900.00	712.00	0.00	9612.00	\N	paid	\N	\N	\N	2026-04-05 12:05:42.032917+00	2026-04-05 14:30:33.137498+00	\N	\N	\N
b7d44922-1f54-459e-937a-8c725c8345ac	b1000000-0000-0000-0000-000000000001	c9da8599-6457-4be3-a89a-37a949ae24cc	d1000000-0000-0000-0000-000000000001	ORD-1012	dine_in	paid	pos	1	10200.00	816.00	0.00	11016.00	\N	paid	\N	\N	\N	2026-04-05 14:29:14.872358+00	2026-04-05 14:30:45.305335+00	\N	\N	\N
78fa2576-dd6e-4f86-b163-362cf3c79ff2	b1000000-0000-0000-0000-000000000001	b03cc4ec-f641-4850-a7e9-34786838af8d	d1000000-0000-0000-0000-000000000001	ORD-1006	dine_in	paid	pos	1	1400.00	112.00	0.00	1512.00	\N	paid	\N	\N	\N	2026-04-05 12:12:46.040403+00	2026-04-05 14:31:36.941986+00	\N	\N	\N
a1388da4-5206-4859-ab90-15b63caa3887	b1000000-0000-0000-0000-000000000001	b03cc4ec-f641-4850-a7e9-34786838af8d	d1000000-0000-0000-0000-000000000001	ORD-1005	dine_in	paid	pos	1	1600.00	128.00	0.00	1728.00	\N	paid	\N	\N	\N	2026-04-05 12:12:40.055775+00	2026-04-05 14:31:47.176551+00	\N	\N	\N
1f4a56a8-e2ba-43c7-b806-823898cea1d4	b1000000-0000-0000-0000-000000000001	0742510a-f4d5-4168-bd05-c2a76d34033c	d1000000-0000-0000-0000-000000000001	ORD-1007	dine_in	paid	pos	1	4800.00	384.00	0.00	5184.00	\N	paid	\N	\N	\N	2026-04-05 12:20:45.21029+00	2026-04-05 14:33:52.10774+00	\N	\N	\N
e1604c4c-aa7e-4254-ad62-8215ebe0cd62	b1000000-0000-0000-0000-000000000001	4572b2f4-5531-485c-a559-428216863a3d	d1000000-0000-0000-0000-000000000001	ORD-1009	dine_in	paid	pos	1	3400.00	272.00	0.00	3672.00	\N	paid	\N	\N	\N	2026-04-05 13:19:12.80853+00	2026-04-06 06:02:05.453237+00	\N	\N	\N
806fe216-614d-4c50-a664-c558303f75dc	b1000000-0000-0000-0000-000000000001	6d0f8075-d156-4930-b5db-5f7eaf22e11e	d1000000-0000-0000-0000-000000000001	ORD-1011	dine_in	paid	pos	1	8200.00	656.00	0.00	8856.00	\N	paid	\N	\N	\N	2026-04-05 13:22:04.452114+00	2026-04-06 13:35:18.228284+00	\N	\N	\N
bd1f7f27-100e-4188-94ae-6b29b79c8c1a	b1000000-0000-0000-0000-000000000001	039ec16f-6079-40fb-9600-863372d68c6d	d1000000-0000-0000-0000-000000000001	ORD-1010	dine_in	paid	pos	1	3200.00	256.00	0.00	3456.00	cash	paid	\N	\N	\N	2026-04-05 13:21:51.372765+00	2026-04-07 06:35:10.701616+00	\N	\N	\N
d6885b17-51c4-4f8e-8e97-a74be1bd7acf	b1000000-0000-0000-0000-000000000001	e205ec48-9c1c-4c82-9e6c-b5689678cda1	d1000000-0000-0000-0000-000000000001	ORD-1013	dine_in	paid	pos	1	2000.00	160.00	0.00	2160.00	cash	paid	\N	\N	\N	2026-04-07 08:34:08.523287+00	2026-04-07 08:34:52.683086+00	\N	\N	\N
392a7699-f3e8-4d31-9402-e409f9fa9c07	b1000000-0000-0000-0000-000000000001	\N	d1000000-0000-0000-0000-000000000001	ORD-1014	takeaway	paid	pos	1	3400.00	272.00	0.00	3672.00	\N	paid	Ali	\N	\N	2026-04-07 08:36:23.738352+00	2026-04-07 08:36:52.661342+00	\N	\N	\N
42f65f07-0332-437c-86e1-2342643a87e1	b1000000-0000-0000-0000-000000000001	\N	d1000000-0000-0000-0000-000000000001	ORD-1015	takeaway	paid	pos	1	1400.00	112.00	0.00	1512.00	\N	paid	Taimoor	\N	\N	2026-04-07 08:37:36.323579+00	2026-04-07 08:37:51.353445+00	\N	\N	\N
fa71fa1d-de84-4038-9b44-e85f2cd57ab6	b1000000-0000-0000-0000-000000000001	\N	d1000000-0000-0000-0000-000000000001	ORD-1016	takeaway	paid	pos	1	5400.00	432.00	0.00	5832.00	\N	paid	Ali	\N	\N	2026-04-07 08:38:34.942197+00	2026-04-07 08:38:53.964189+00	\N	\N	\N
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.plans (id, name, price, max_tables, max_employees, features, created_at) FROM stdin;
a1000000-0000-0000-0000-000000000001	Starter	29.00	10	15	{"gl": false, "recipes": false, "online_orders": false}	2026-04-05 12:05:42.032917+00
a1000000-0000-0000-0000-000000000002	Pro	79.00	30	50	{"gl": true, "recipes": true, "online_orders": true}	2026-04-05 12:05:42.032917+00
a1000000-0000-0000-0000-000000000003	Enterprise	199.00	100	200	{"gl": true, "recipes": true, "multi_branch": true, "online_orders": true}	2026-04-05 12:05:42.032917+00
\.


--
-- Data for Name: recipe_ingredients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.recipe_ingredients (id, recipe_id, inventory_item_id, name, quantity, unit) FROM stdin;
c5a4bad9-e090-4a6b-a82d-dc7cc4f65ee0	9b000000-0000-0000-0000-000000000001	9a000000-0000-0000-0000-000000000001	Beef (Ribeye)	0.2500	kg
c2ab9591-da83-4f8f-beb2-76c4452d1b24	9b000000-0000-0000-0000-000000000001	9a000000-0000-0000-0000-000000000010	Butter	0.0300	kg
71036d99-3d5a-4db5-a8a4-5da92d4bee01	9b000000-0000-0000-0000-000000000002	9a000000-0000-0000-0000-000000000006	Arborio Rice	0.2000	kg
6adc5176-250a-4c23-ad38-31736bb055d1	9b000000-0000-0000-0000-000000000002	9a000000-0000-0000-0000-000000000005	Truffle Oil	0.0150	L
ec903b87-0553-4a4b-9d05-55182c2708f9	9b000000-0000-0000-0000-000000000002	9a000000-0000-0000-0000-000000000009	Parmesan	0.0500	kg
294099c4-76f4-48b1-bc83-455f187b0f4e	9b000000-0000-0000-0000-000000000002	9a000000-0000-0000-0000-000000000011	Eggs	2.0000	pcs
60bb3eb2-85ff-468d-8c56-937380e2b682	9b000000-0000-0000-0000-000000000003	9a000000-0000-0000-0000-000000000006	Arborio Rice	0.1600	kg
3851abc0-67ad-496e-a8a8-29343fc0bf4e	9b000000-0000-0000-0000-000000000003	9a000000-0000-0000-0000-000000000002	Wild Mushrooms	0.1500	kg
2fbca809-e61e-4037-ae64-733c717a417c	9b000000-0000-0000-0000-000000000003	9a000000-0000-0000-0000-000000000009	Parmesan	0.0600	kg
a73ccc0b-0041-4605-a7ff-b49d3dc2e769	9b000000-0000-0000-0000-000000000003	9a000000-0000-0000-0000-000000000010	Butter	0.0400	kg
\.


--
-- Data for Name: recipes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.recipes (id, restaurant_id, menu_item_id, name, instructions, prep_time_min, cook_time_min, serves, notes, created_at, updated_at) FROM stdin;
9b000000-0000-0000-0000-000000000001	b1000000-0000-0000-0000-000000000001	f1000000-0000-0000-0000-000000000004	Beef Ribeye 250g	1. Remove steak from refrigerator 30 minutes before cooking.\n2. Pat dry and season generously with salt and black pepper.\n3. Heat cast iron pan until smoking hot.\n4. Sear steak 3 minutes each side for medium-rare.\n5. Add butter, garlic and rosemary; baste for 2 minutes.\n6. Rest on wire rack for 8 minutes before serving.\n7. Serve with herb butter and seasoned fries.	15	22	1	\N	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9b000000-0000-0000-0000-000000000002	b1000000-0000-0000-0000-000000000001	f1000000-0000-0000-0000-000000000001	Truffle Arancini	1. Cook risotto with parmesan until thick. Cool completely.\n2. Form balls around a cube of mozzarella.\n3. Dip in beaten egg then breadcrumbs. Repeat for double coat.\n4. Deep fry at 180°C for 4-5 minutes until golden brown.\n5. Drain on paper towels. Drizzle with truffle oil.\n6. Serve with marinara sauce.	20	12	4	\N	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
9b000000-0000-0000-0000-000000000003	b1000000-0000-0000-0000-000000000001	f1000000-0000-0000-0000-000000000006	Wild Mushroom Risotto	1. Sauté mixed mushrooms in butter with thyme. Set aside.\n2. In same pan, toast arborio rice for 2 minutes.\n3. Deglaze with white wine and stir until absorbed.\n4. Add warm stock one ladle at a time, stirring constantly.\n5. When rice is al dente, fold in mushrooms, butter and parmesan.\n6. Rest covered for 2 minutes. Plate and garnish with truffle oil.	10	20	2	\N	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_tokens (id, employee_id, token, expires_at, created_at) FROM stdin;
e30592a2-d310-4610-86f4-cc196988d06b	d1000000-0000-0000-0000-000000000001	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImQxMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsImlhdCI6MTc3NTYyNzI2NSwiZXhwIjoxNzc2MjMyMDY1fQ.sZny4cEWv5x-SuZ2uchcPGN9xyWkHYkAZR5Aa4lSA4I	2026-04-15 05:47:45.853764+00	2026-04-08 05:47:45.853764+00
\.


--
-- Data for Name: reservations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservations (id, restaurant_id, table_id, guest_name, guest_phone, guest_count, reserved_at, duration_min, status, notes, created_at) FROM stdin;
e7707e9d-f155-4d7b-a9a4-2ea7e95b61cb	b1000000-0000-0000-0000-000000000001	c9da8599-6457-4be3-a89a-37a949ae24cc	VIP Guest	+9230068879654	10	2026-04-05 18:00:00+00	90	cancelled	\N	2026-04-05 14:33:12.674398+00
\.


--
-- Data for Name: restaurants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.restaurants (id, plan_id, name, slug, email, phone, address, city, country, currency, timezone, logo_url, status, trial_ends_at, settings, created_at, updated_at) FROM stdin;
b1000000-0000-0000-0000-000000000002	a1000000-0000-0000-0000-000000000001	Spice Garden	spice-garden	info@spicegarden.com	+92-42-3333-4444	45-B Gulberg III, Main Boulevard	Lahore	Pakistan	PKR	Asia/Karachi	\N	active	2026-04-19 12:05:42.032917+00	{}	2026-04-05 12:05:42.032917+00	2026-04-05 12:05:42.032917+00
b1000000-0000-0000-0000-000000000001	a1000000-0000-0000-0000-000000000002	The Golden Fork	golden-fork	admin@goldenfork.com	+92-21-3456-7890	Shop 12, Zamzama Commercial Lane, DHA Phase 5	Karachi	Pakistan	PKR	Asia/Karachi	\N	active	2026-04-19 12:05:42.032917+00	{"setup_complete": true}	2026-04-05 12:05:42.032917+00	2026-04-06 12:18:45.118695+00
85bb9265-65d1-45f7-ac27-2358e7f0c5e2	a1000000-0000-0000-0000-000000000001	The Pace Restaurant	the-pace-restaurant	pace@gmail.com	+923174730730	Area III-C plot 6/1 flat B-1 first floor Nazimabad #3 Karachi.	KARACHI	Pakistan	PKR	Asia/Karachi	\N	trial	2026-04-20 12:22:45.254086+00	{"setup_complete": true}	2026-04-06 12:22:45.254086+00	2026-04-06 12:28:43.536902+00
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, restaurant_id, name, permissions, is_system, created_at) FROM stdin;
c1000000-0000-0000-0000-000000000001	b1000000-0000-0000-0000-000000000001	Manager	["dashboard", "pos", "kitchen", "tables", "inventory", "recipes", "employees", "gl", "alerts", "settings"]	t	2026-04-05 12:05:42.032917+00
c1000000-0000-0000-0000-000000000002	b1000000-0000-0000-0000-000000000001	Head Server	["pos", "kitchen", "tables", "alerts"]	t	2026-04-05 12:05:42.032917+00
c1000000-0000-0000-0000-000000000003	b1000000-0000-0000-0000-000000000001	Server	["pos", "tables", "alerts"]	t	2026-04-05 12:05:42.032917+00
c1000000-0000-0000-0000-000000000004	b1000000-0000-0000-0000-000000000001	Chef	["kitchen", "recipes", "inventory", "alerts"]	t	2026-04-05 12:05:42.032917+00
c1000000-0000-0000-0000-000000000005	b1000000-0000-0000-0000-000000000001	Cashier	["pos", "alerts"]	t	2026-04-05 12:05:42.032917+00
5f44be52-c308-4bac-9b2b-0edad8ed74f7	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Manager	["dashboard", "pos", "kitchen", "tables", "inventory", "recipes", "employees", "gl", "alerts", "settings"]	t	2026-04-06 12:22:45.254086+00
74cc15f9-d411-4b5b-96c5-39097af5cc2b	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Head Server	["pos", "kitchen", "tables", "alerts"]	f	2026-04-06 12:22:45.254086+00
edc5a840-48a9-4773-a191-993ab78720f4	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Server	["pos", "tables", "alerts"]	f	2026-04-06 12:22:45.254086+00
5b9292cf-8afe-42bb-ae85-1519055dce22	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Chef	["kitchen", "recipes", "inventory", "alerts"]	f	2026-04-06 12:22:45.254086+00
ab9e9f12-8f84-4f52-8573-fe99c5accf17	85bb9265-65d1-45f7-ac27-2358e7f0c5e2	Cashier	["pos", "alerts"]	f	2026-04-06 12:22:45.254086+00
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.shifts (id, restaurant_id, employee_id, shift_name, start_time, end_time, date, status, notes, created_at) FROM stdin;
0990edfa-e3ed-4db1-a7b5-e1999195dd8f	b1000000-0000-0000-0000-000000000001	d1000000-0000-0000-0000-000000000001	Morning	08:00:00	16:00:00	2026-04-05	active	\N	2026-04-05 12:05:42.032917+00
295f5967-6015-4609-9b3b-a665a4af2048	b1000000-0000-0000-0000-000000000001	d1000000-0000-0000-0000-000000000002	Morning	09:00:00	17:00:00	2026-04-05	active	\N	2026-04-05 12:05:42.032917+00
3e7be841-2bee-416d-8cad-adb8259f0165	b1000000-0000-0000-0000-000000000001	d1000000-0000-0000-0000-000000000003	Morning	09:00:00	17:00:00	2026-04-05	active	\N	2026-04-05 12:05:42.032917+00
d67394c5-72ee-41da-a7e9-899533ea78fb	b1000000-0000-0000-0000-000000000001	d1000000-0000-0000-0000-000000000004	Morning	07:00:00	15:00:00	2026-04-05	active	\N	2026-04-05 12:05:42.032917+00
0c10687f-d00b-4f7a-bbe3-6e9d1f16a879	b1000000-0000-0000-0000-000000000001	d1000000-0000-0000-0000-000000000005	Morning	09:00:00	17:00:00	2026-04-05	active	\N	2026-04-05 12:05:42.032917+00
99f463a0-8361-4cac-81d5-285fde786cdc	b1000000-0000-0000-0000-000000000001	d1000000-0000-0000-0000-000000000001	Evening	15:00:00	23:00:00	2026-04-07	active	\N	2026-04-07 06:16:22.930005+00
1e35627c-2862-47f8-af33-9f6bde83e4d6	b1000000-0000-0000-0000-000000000001	d1000000-0000-0000-0000-000000000003	Evening	15:00:00	23:00:00	2026-04-07	active	\N	2026-04-07 06:16:41.307968+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, full_name, is_super_admin, last_login, created_at) FROM stdin;
018b72aa-f9ef-4a54-94db-701bc49691b0	superadmin@restaurantos.com	$2b$10$N9Nx17Dd8KmzhTr5mkF4EuvbaOhOYbkg8cY0IjA8b2geV1gRYNSAG	Super Admin	t	\N	2026-04-05 12:05:42.032917+00
\.


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_restaurant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_restaurant_id_name_key UNIQUE (restaurant_id, name);


--
-- Name: dining_tables dining_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_pkey PRIMARY KEY (id);


--
-- Name: dining_tables dining_tables_restaurant_id_label_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_restaurant_id_label_key UNIQUE (restaurant_id, label);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees employees_restaurant_id_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_restaurant_id_email_key UNIQUE (restaurant_id, email);


--
-- Name: gl_accounts gl_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_pkey PRIMARY KEY (id);


--
-- Name: gl_accounts gl_accounts_restaurant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_restaurant_id_code_key UNIQUE (restaurant_id, code);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_restaurant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_restaurant_id_name_key UNIQUE (restaurant_id, name);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_restaurant_id_order_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_restaurant_id_order_number_key UNIQUE (restaurant_id, order_number);


--
-- Name: plans plans_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_name_key UNIQUE (name);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: recipe_ingredients recipe_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id);


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_key UNIQUE (token);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: restaurants restaurants_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_email_key UNIQUE (email);


--
-- Name: restaurants restaurants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_pkey PRIMARY KEY (id);


--
-- Name: restaurants restaurants_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_slug_key UNIQUE (slug);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_dining_tables_restaurant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dining_tables_restaurant ON public.dining_tables USING btree (restaurant_id);


--
-- Name: idx_employees_restaurant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employees_restaurant ON public.employees USING btree (restaurant_id);


--
-- Name: idx_inventory_restaurant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_restaurant ON public.inventory_items USING btree (restaurant_id);


--
-- Name: idx_journal_entries_restaurant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_entries_restaurant ON public.journal_entries USING btree (restaurant_id, entry_date);


--
-- Name: idx_notifications_restaurant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_restaurant ON public.notifications USING btree (restaurant_id, is_read);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_restaurant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_restaurant ON public.orders USING btree (restaurant_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_shifts_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_shifts_employee ON public.shifts USING btree (employee_id, date);


--
-- Name: employees trg_employees_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: inventory_items trg_inventory_alert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_inventory_alert AFTER UPDATE OF stock_quantity ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.check_inventory_alert();


--
-- Name: inventory_items trg_inventory_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: menu_items trg_menu_items_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: orders trg_orders_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: recipes trg_recipes_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: restaurants trg_restaurants_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: categories categories_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: dining_tables dining_tables_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: employees employees_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: employees employees_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: gl_accounts gl_accounts_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: inventory_items inventory_items_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: inventory_transactions inventory_transactions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: inventory_transactions inventory_transactions_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: inventory_transactions inventory_transactions_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: journal_entries journal_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id);


--
-- Name: journal_entries journal_entries_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: journal_lines journal_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.gl_accounts(id);


--
-- Name: journal_lines journal_lines_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: menu_items menu_items_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: orders orders_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: orders orders_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.dining_tables(id);


--
-- Name: recipe_ingredients recipe_ingredients_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: recipe_ingredients recipe_ingredients_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipes recipes_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: recipes recipes_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.dining_tables(id);


--
-- Name: restaurants restaurants_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: roles roles_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: shifts shifts_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: shifts shifts_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict fAHWAOGeWBdE4nOzDvnfzurIJPZn8OBYmUiWqYnMqUXAfuPj99cFzle4FUNjvTs

