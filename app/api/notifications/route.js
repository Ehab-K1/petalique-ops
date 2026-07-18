import { NextResponse } from "next/server";
import { db, invoiceTotals } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/*
 * Everything that needs a human's attention, in one feed — powers the bell
 * in the top bar. Each item links straight to the page where it gets fixed.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sql = await db();

  const [inquiries, overdue, dueToday, agingStock, openInvoices] = await Promise.all([
    sql`SELECT id, customer_name, delivery_date, created_at FROM orders
        WHERE deleted_at IS NULL AND source = 'webform' AND status = 'pending'
        ORDER BY created_at DESC LIMIT 8`,
    sql`SELECT id, customer_name, delivery_date FROM orders
        WHERE deleted_at IS NULL AND delivery_date < CURRENT_DATE
          AND status NOT IN ('delivered','picked_up','cancelled')
        ORDER BY delivery_date ASC LIMIT 8`,
    sql`SELECT id, customer_name, delivery_time FROM orders
        WHERE deleted_at IS NULL AND delivery_date = CURRENT_DATE
          AND status NOT IN ('delivered','picked_up','cancelled')
        ORDER BY delivery_time ASC LIMIT 8`,
    sql`SELECT COUNT(*)::int AS c FROM inventory_batches
        WHERE status = 'available' AND intake_date <= CURRENT_DATE - 7`,
    sql`SELECT id, number, customer_name, due_date, status, items, tax_rate, discount FROM invoices
        WHERE deleted_at IS NULL AND kind = 'invoice' AND status IN ('sent','partial','accepted')
          AND due_date IS NOT NULL AND due_date < CURRENT_DATE
        ORDER BY due_date ASC LIMIT 8`,
  ]);

  const items = [];
  for (const o of inquiries) {
    items.push({
      kind: "inquiry", href: `/orders/${o.id}`,
      title: `New web inquiry — ${o.customer_name}`,
      sub: `wants it ${String(o.delivery_date).slice(0, 10)}`,
    });
  }
  for (const o of dueToday) {
    items.push({
      kind: "today", href: `/orders/${o.id}`,
      title: `Due today — ${o.customer_name}`,
      sub: o.delivery_time ? `at ${o.delivery_time}` : "no time set",
    });
  }
  for (const o of overdue) {
    items.push({
      kind: "overdue", href: `/orders/${o.id}`,
      title: `Overdue — ${o.customer_name}`,
      sub: `was due ${String(o.delivery_date).slice(0, 10)}`,
    });
  }
  for (const inv of openInvoices) {
    const t = invoiceTotals(inv);
    items.push({
      kind: "invoice", href: `/invoices?open=${inv.id}`,
      title: `Invoice overdue — ${inv.number}`,
      sub: `${inv.customer_name} · $${t.total.toFixed(2)} · due ${String(inv.due_date).slice(0, 10)}`,
    });
  }
  if (agingStock[0].c > 0) {
    items.push({
      kind: "stock", href: "/inventory",
      title: `${agingStock[0].c} stem batch${agingStock[0].c === 1 ? "" : "es"} at 7+ days`,
      sub: "use or discount before they wilt",
    });
  }

  return NextResponse.json({
    count: items.length,
    items: items.slice(0, 20),
  });
}
