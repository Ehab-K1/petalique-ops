import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL);

/* Default catalog seeded on first v3 boot — after that, Settings → Catalog owns it. */
const DEFAULT_PRODUCTS = [
  "Bloom Bar",
  "Flower Canopy / Phoolon Ki Chaadar",
  "Bouquet",
  "Gajra / Corsage",
  "Garland / Mala",
  "Boutonniere",
  "Hair Piece",
  "Bridal Flower Jewelry",
  "Gift Basket",
  "Table Arrangements",
  "Rose Petal Bags",
  "Wholesale",
];

const DEFAULT_ADDONS = [
  ["Baby Breath Bunches", ""],
  ["Tissue", ""],
  ["Jewels on Flowers", "+$5–$30"],
  ["Hand Written Card", "+$5"],
  ["Initial", "+$15"],
  ["Butterfly", "+$2/each"],
  ["Crown", "+$5"],
  ["Tiara", "+$10"],
  ["Baby Breath Rim", "+$10"],
  ["“Just For You” Ribbon", "+$2"],
  ["Bow Topper", "+$5"],
  ["Bow + Custom Banner", "+$20"],
  ["Pearl Bow", "+$5"],
  ["Glitter", "+$1/stem"],
  ["Green Floral Foam", "+$5"],
];

export const DEFAULT_BUSINESS = {
  name: "Petalique Flora",
  tagline: "Premium Floral Designs & Event Rentals",
  email: "hello@petaliqueflora.com",
  phone: "647-446-3149",
  address: "",
  tax_rate: 13,
  deposit_pct: 50,
  invoice_footer: "Thank you for choosing Petalique Flora",
};

export async function ensureSchema() {
  if (globalThis.__pfSchemaReady3) return;
  try {
    await runMigrations();
  } catch (err) {
    // Two serverless instances can cold-start at the same moment and race on
    // CREATE TABLE IF NOT EXISTS (Postgres raises 23505 on pg_type / 42P07).
    // The other instance won the race and did the work — safe to continue.
    if (err?.code === "23505" || err?.code === "42P07") {
      console.warn("schema migration raced with another instance — continuing");
    } else {
      throw err;
    }
  }
  await runV3Backfill();
  globalThis.__pfSchemaReady3 = true;
}

async function runMigrations() {
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

  // v2 — columns on orders
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'delivery'`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'staff'`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS occasion TEXT DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`;
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
  await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS event_date TEXT DEFAULT ''`;
  await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deposit_pct NUMERIC DEFAULT 0`;

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

  /* ---------------- v3 — connected CRM layer ---------------- */

  // Soft delete everywhere: mistakes become recoverable instead of permanent.
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id INTEGER`;

  // Activity log — every create/update/delete across the app, powering
  // per-record timelines and the dashboard feed.
  await sql`CREATE TABLE IF NOT EXISTS activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    user_name TEXT DEFAULT '',
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    summary TEXT DEFAULT '',
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
  )`;

  // Key-value settings (business profile, tax, migration flags)
  await sql`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now()
  )`;

  // Editable product / add-on catalog — feeds the public order form and invoicing.
  await sql`CREATE TABLE IF NOT EXISTS catalog_items (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'product',
    name TEXT NOT NULL,
    price_label TEXT DEFAULT '',
    price NUMERIC,
    active BOOLEAN NOT NULL DEFAULT true,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (delivery_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices (customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices (order_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity (entity, entity_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity (created_at DESC)`;

  const rows = await sql`SELECT COUNT(*)::int AS c FROM users`;
  if (rows[0].c === 0) {
    const email = (process.env.ADMIN_EMAIL || "owner@petalique.com").toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "PetaliqueAdmin1!";
    const hash = await bcrypt.hash(password, 10);
    await sql`INSERT INTO users (email, name, role, password_hash) VALUES (${email}, ${"Owner"}, ${"admin"}, ${hash})`;
  }
}

/*
 * One-time v3 backfill (guarded by a settings flag):
 *  1. Link historical orders to customers by phone → email → name.
 *  2. Create customer records for orders that never had one (webform orders
 *     were previously saved with customer_id NULL — the reason the Customers
 *     page always said "no orders yet").
 *  3. Same linking for invoices, then stamp payments with customer_id.
 *  4. Seed the editable catalog + business settings.
 */
async function runV3Backfill() {
  try {
    const done = await sql`SELECT key FROM settings WHERE key = 'v3_backfill'`;
    if (done.length > 0) return;

    // 1. link orders → existing customers (phone digits, then email, then exact name)
    await sql`UPDATE orders o SET customer_id = c.id FROM customers c
      WHERE o.customer_id IS NULL AND o.deleted_at IS NULL AND c.deleted_at IS NULL
        AND length(regexp_replace(COALESCE(o.phone,''), '[^0-9]', '', 'g')) >= 7
        AND regexp_replace(COALESCE(o.phone,''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(c.phone,''), '[^0-9]', '', 'g')`;
    await sql`UPDATE orders o SET customer_id = c.id FROM customers c
      WHERE o.customer_id IS NULL AND o.deleted_at IS NULL AND c.deleted_at IS NULL
        AND COALESCE(o.email,'') <> '' AND lower(trim(o.email)) = lower(trim(c.email))`;
    await sql`UPDATE orders o SET customer_id = c.id FROM customers c
      WHERE o.customer_id IS NULL AND o.deleted_at IS NULL AND c.deleted_at IS NULL
        AND lower(trim(o.customer_name)) = lower(trim(c.name))`;

    // 2. create customers for still-unlinked orders (newest contact info wins)
    await sql`INSERT INTO customers (name, phone, email, type, notes)
      SELECT DISTINCT ON (lower(trim(customer_name)))
        trim(customer_name),
        COALESCE(phone, ''),
        COALESCE(lower(email), ''),
        CASE WHEN order_type = 'wholesale' THEN 'wholesale' ELSE 'retail' END,
        'Added automatically from order history'
      FROM orders
      WHERE customer_id IS NULL AND deleted_at IS NULL AND trim(COALESCE(customer_name,'')) <> ''
      ORDER BY lower(trim(customer_name)), created_at DESC`;
    await sql`UPDATE orders o SET customer_id = c.id FROM customers c
      WHERE o.customer_id IS NULL AND o.deleted_at IS NULL AND c.deleted_at IS NULL
        AND lower(trim(o.customer_name)) = lower(trim(c.name))`;

    // 3. link invoices → customers, then payments → customers
    await sql`UPDATE invoices i SET customer_id = c.id FROM customers c
      WHERE i.customer_id IS NULL AND i.deleted_at IS NULL AND c.deleted_at IS NULL
        AND length(regexp_replace(COALESCE(i.customer_phone,''), '[^0-9]', '', 'g')) >= 7
        AND regexp_replace(COALESCE(i.customer_phone,''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(c.phone,''), '[^0-9]', '', 'g')`;
    await sql`UPDATE invoices i SET customer_id = c.id FROM customers c
      WHERE i.customer_id IS NULL AND i.deleted_at IS NULL AND c.deleted_at IS NULL
        AND COALESCE(i.customer_email,'') <> '' AND lower(trim(i.customer_email)) = lower(trim(c.email))`;
    await sql`UPDATE invoices i SET customer_id = c.id FROM customers c
      WHERE i.customer_id IS NULL AND i.deleted_at IS NULL AND c.deleted_at IS NULL
        AND lower(trim(i.customer_name)) = lower(trim(c.name))`;
    await sql`UPDATE payments p SET customer_id = o.customer_id FROM orders o
      WHERE p.customer_id IS NULL AND p.order_id = o.id AND o.customer_id IS NOT NULL`;
    await sql`UPDATE payments p SET customer_id = i.customer_id FROM invoices i
      WHERE p.customer_id IS NULL AND p.invoice_id = i.id AND i.customer_id IS NOT NULL`;

    // 4. seed catalog + business settings
    const cat = await sql`SELECT COUNT(*)::int AS c FROM catalog_items`;
    if (cat[0].c === 0) {
      for (let i = 0; i < DEFAULT_PRODUCTS.length; i++) {
        await sql`INSERT INTO catalog_items (kind, name, sort) VALUES ('product', ${DEFAULT_PRODUCTS[i]}, ${i})`;
      }
      for (let i = 0; i < DEFAULT_ADDONS.length; i++) {
        const [name, label] = DEFAULT_ADDONS[i];
        await sql`INSERT INTO catalog_items (kind, name, price_label, sort) VALUES ('addon', ${name}, ${label}, ${i})`;
      }
    }
    const biz = await sql`SELECT key FROM settings WHERE key = 'business'`;
    if (biz.length === 0) {
      await sql`INSERT INTO settings (key, value) VALUES ('business', ${JSON.stringify(DEFAULT_BUSINESS)})`;
    }

    await sql`INSERT INTO settings (key, value) VALUES ('v3_backfill', ${JSON.stringify({ at: new Date().toISOString() })})
      ON CONFLICT (key) DO NOTHING`;
  } catch (err) {
    // Never let a backfill hiccup take the app down — it retries on next cold start.
    console.error("v3 backfill error", err);
  }
}

export async function db() {
  await ensureSchema();
  return sql;
}

export async function getBusiness(sqlc) {
  const s = sqlc || (await db());
  const rows = await s`SELECT value FROM settings WHERE key = 'business'`;
  return { ...DEFAULT_BUSINESS, ...(rows[0]?.value || {}) };
}

export function invoiceTotals(inv) {
  const items = Array.isArray(inv.items) ? inv.items : [];
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const discount = Number(inv.discount) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * ((Number(inv.tax_rate) || 0) / 100);
  return { subtotal, discount, tax, total: taxable + tax };
}
