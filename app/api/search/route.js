import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/* Global search across the whole system — powers the ⌘K command palette. */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const sql = await db();
  const like = `%${q}%`;
  const idNum = /^#?\d+$/.test(q) ? parseInt(q.replace("#", ""), 10) : null;

  const [customers, orders, invoices, payments] = await Promise.all([
    sql`SELECT id, name, phone, email, company, type FROM customers
        WHERE deleted_at IS NULL AND (name ILIKE ${like} OR phone ILIKE ${like} OR email ILIKE ${like} OR company ILIKE ${like})
        ORDER BY name ASC LIMIT 6`,
    sql`SELECT id, customer_name, delivery_date, status, total, fulfillment_type FROM orders
        WHERE deleted_at IS NULL AND (customer_name ILIKE ${like} OR items_desc ILIKE ${like}
          OR address ILIKE ${like} OR notes ILIKE ${like}
          OR (${idNum}::int IS NOT NULL AND id = ${idNum}::int))
        ORDER BY delivery_date DESC LIMIT 6`,
    sql`SELECT id, number, kind, customer_name, status, token FROM invoices
        WHERE deleted_at IS NULL AND (number ILIKE ${like} OR customer_name ILIKE ${like})
        ORDER BY created_at DESC LIMIT 5`,
    sql`SELECT id, amount, customer_name, method, paid_date, order_id FROM payments
        WHERE deleted_at IS NULL AND (customer_name ILIKE ${like} OR reference ILIKE ${like})
        ORDER BY paid_date DESC LIMIT 4`,
  ]);

  const results = [
    ...customers.map((c) => ({
      type: "customer", id: c.id, href: `/customers/${c.id}`,
      title: c.name, sub: [c.company, c.phone, c.email].filter(Boolean).join(" · ") || c.type,
    })),
    ...orders.map((o) => ({
      type: "order", id: o.id, href: `/orders/${o.id}`,
      title: `Order #${o.id} — ${o.customer_name}`,
      sub: `${String(o.delivery_date).slice(0, 10)} · ${o.status}${Number(o.total) > 0 ? ` · $${Number(o.total).toFixed(2)}` : ""}`,
    })),
    ...invoices.map((i) => ({
      type: "invoice", id: i.id, href: `/invoices?open=${i.id}`,
      title: `${i.number} — ${i.customer_name}`,
      sub: `${i.kind === "quote" ? "Quotation" : "Invoice"} · ${i.status}`,
    })),
    ...payments.map((p) => ({
      type: "payment", id: p.id, href: p.order_id ? `/orders/${p.order_id}` : "/payments",
      title: `$${Number(p.amount).toFixed(2)} — ${p.customer_name || "payment"}`,
      sub: `${String(p.paid_date).slice(0, 10)} · ${p.method}`,
    })),
  ];
  return NextResponse.json({ results });
}
