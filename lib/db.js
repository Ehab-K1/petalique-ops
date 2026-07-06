import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL);

export async function ensureSchema() {
  if (globalThis.__pfSchemaReady2) return;
  await sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'retail',
    company TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    order_type TEXT NOT NULL DEFAULT 'retail',
    items_desc TEXT DEFAULT '',
    delivery_date DATE NOT NULL,
    delivery_time TEXT DEFAULT '',
    address TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    total NUMERIC DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS inventory_batches (
    id SERIAL PRIMARY KEY,
    variety TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    initial_quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost NUMERIC,
    intake_date DATE NOT NULL,
    source TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'available',
    assigned_order_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;

  // v2 — new columns on orders
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'delivery'`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'staff'`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS occasion TEXT DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`;

  // v2.2 — public order form: structured product/add-on capture (parity with Google Form)
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_types TEXT DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity TEXT DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS addons TEXT DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS preferred_contact TEXT DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS marketing_optin BOOLEAN NOT NULL DEFAULT false`;

  // v2 — payments ledger
  await sql`CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    invoice_id INTEGER,
    customer_name TEXT DEFAULT '',
    amount NUMERIC NOT NULL DEFAULT 0,
    method TEXT NOT NULL DEFAULT 'cash',
    paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
  )`;

  // v2 — invoices and quotations
  await sql`CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    number TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'invoice',
    status TEXT NOT NULL DEFAULT 'draft',
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_email TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    customer_address TEXT DEFAULT '',
    order_id INTEGER,
    items JSONB NOT NULL DEFAULT '[]',
    tax_rate NUMERIC DEFAULT 13,
    discount NUMERIC DEFAULT 0,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    notes TEXT DEFAULT '',
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;

  // v2.1 — expense tracker
  await sql`CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL DEFAULT 'other',
    description TEXT NOT NULL,
    vendor TEXT DEFAULT '',
    amount NUMERIC NOT NULL DEFAULT 0,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    method TEXT DEFAULT '',
    recurring BOOLEAN DEFAULT false,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
  )`;

  const rows = await sql`SELECT COUNT(*)::int AS c FROM users`;
  if (rows[0].c === 0) {
    const email = (process.env.ADMIN_EMAIL || "owner@petalique.com").toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "PetaliqueAdmin1!";
    const hash = await bcrypt.hash(password, 10);
    await sql`INSERT INTO users (email, name, role, password_hash) VALUES (${email}, ${"Owner"}, ${"admin"}, ${hash})`;
  }
  globalThis.__pfSchemaReady2 = true;
}

export async function db() {
  await ensureSchema();
  return sql;
}

export function invoiceTotals(inv) {
  const items = Array.isArray(inv.items) ? inv.items : [];
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const discount = Number(inv.discount) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * ((Number(inv.tax_rate) || 0) / 100);
  return { subtotal, discount, tax, total: taxable + tax };
}
