import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { syncOrderPayment, syncInvoicePayment } from "@/lib/sync";

const TABLES = {
  order: "orders",
  customer: "customers",
  payment: "payments",
  invoice: "invoices",
  expense: "expenses",
};

/* The safety net: everything deleted anywhere in the app lands here and can
   be restored with one click (admin-only, under Settings → Trash). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const sql = await db();

  const [orders, customers, payments, invoices, expenses] = await Promise.all([
    sql`SELECT id, customer_name, delivery_date, total, deleted_at FROM orders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`,
    sql`SELECT id, name, phone, deleted_at FROM customers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`,
    sql`SELECT id, amount, customer_name, paid_date, deleted_at FROM payments WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`,
    sql`SELECT id, number, customer_name, deleted_at FROM invoices WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`,
    sql`SELECT id, description, amount, expense_date, deleted_at FROM expenses WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`,
  ]);

  const items = [
    ...orders.map((r) => ({ entity: "order", id: r.id, deleted_at: r.deleted_at, title: `Order #${r.id} — ${r.customer_name}`, sub: `${String(r.delivery_date).slice(0, 10)}${Number(r.total) > 0 ? ` · $${Number(r.total).toFixed(2)}` : ""}` })),
    ...customers.map((r) => ({ entity: "customer", id: r.id, deleted_at: r.deleted_at, title: r.name, sub: r.phone || "customer" })),
    ...payments.map((r) => ({ entity: "payment", id: r.id, deleted_at: r.deleted_at, title: `$${Number(r.amount).toFixed(2)} — ${r.customer_name || "payment"}`, sub: String(r.paid_date).slice(0, 10) })),
    ...invoices.map((r) => ({ entity: "invoice", id: r.id, deleted_at: r.deleted_at, title: `${r.number} — ${r.customer_name}`, sub: "invoice / quote" })),
    ...expenses.map((r) => ({ entity: "expense", id: r.id, deleted_at: r.deleted_at, title: r.description, sub: `$${Number(r.amount).toFixed(2)} · ${String(r.expense_date).slice(0, 10)}` })),
  ].sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));

  return NextResponse.json({ items });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = await request.json();
  const table = TABLES[b.entity];
  if (!table || !b.id) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const sql = await db();
  const id = parseInt(b.id, 10);

  if (b.action === "restore") {
    if (table === "orders") await sql`UPDATE orders SET deleted_at = NULL WHERE id = ${id}`;
    if (table === "customers") await sql`UPDATE customers SET deleted_at = NULL WHERE id = ${id}`;
    if (table === "payments") {
      const [p] = await sql`UPDATE payments SET deleted_at = NULL WHERE id = ${id} RETURNING order_id, invoice_id`;
      if (p?.invoice_id) await syncInvoicePayment(sql, p.invoice_id);
      if (p?.order_id) await syncOrderPayment(sql, p.order_id);
    }
    if (table === "invoices") {
      const [i] = await sql`UPDATE invoices SET deleted_at = NULL WHERE id = ${id} RETURNING order_id`;
      if (i?.order_id) await syncOrderPayment(sql, i.order_id);
    }
    if (table === "expenses") await sql`UPDATE expenses SET deleted_at = NULL WHERE id = ${id}`;
    await logActivity(sql, user, "restored", b.entity, id, `restored ${b.entity} #${id} from trash`);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "purge") {
    if (table === "orders") await sql`DELETE FROM orders WHERE id = ${id} AND deleted_at IS NOT NULL`;
    if (table === "customers") await sql`DELETE FROM customers WHERE id = ${id} AND deleted_at IS NOT NULL`;
    if (table === "payments") await sql`DELETE FROM payments WHERE id = ${id} AND deleted_at IS NOT NULL`;
    if (table === "invoices") await sql`DELETE FROM invoices WHERE id = ${id} AND deleted_at IS NOT NULL`;
    if (table === "expenses") await sql`DELETE FROM expenses WHERE id = ${id} AND deleted_at IS NOT NULL`;
    await logActivity(sql, user, "purged", b.entity, id, `permanently deleted ${b.entity} #${id}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
