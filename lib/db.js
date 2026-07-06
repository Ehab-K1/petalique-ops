import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL);

export async function ensureSchema() {
  if (globalThis.__pfSchemaReady) return;
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
  const rows = await sql`SELECT COUNT(*)::int AS c FROM users`;
  if (rows[0].c === 0) {
    const email = (process.env.ADMIN_EMAIL || "owner@petalique.com").toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "PetaliqueAdmin1!";
    const hash = await bcrypt.hash(password, 10);
    await sql`INSERT INTO users (email, name, role, password_hash) VALUES (${email}, ${"Owner"}, ${"admin"}, ${hash})`;
  }
  globalThis.__pfSchemaReady = true;
}

export async function db() {
  await ensureSchema();
  return sql;
}
