import Nav from "@/components/Nav";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db, invoiceTotals } from "@/lib/db";
import OrderDetail from "@/components/OrderDetail";

export const dynamic = "force-dynamic";

/*
 * The full record for one order: status pipeline, money collected against it,
 * linked invoices, the customer behind it, and its complete activity history.
 */
export default async function OrderDetailPage({ params }) {
  const user = await requireUser();
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();
  const sql = await db();

  const [order] = await sql`
    SELECT o.*, u.name AS assigned_name FROM orders o
    LEFT JOIN users u ON u.id = o.assigned_user_id
    WHERE o.id = ${id}`;
  if (!order) notFound();

  if (order.deleted_at) {
    return (
      <>
        <Nav user={user} />
        <div className="page">
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <div className="page-title">Order #{id} is in the trash</div>
            <p className="muted" style={{ marginBottom: 16 }}>
              It was removed but nothing is lost — an admin can restore it from Settings → Trash.
            </p>
            <Link href="/orders" className="btn">← Back to orders</Link>
          </div>
        </div>
      </>
    );
  }

  const [payments, invoices, activity, customer, customers, users] = await Promise.all([
    sql`SELECT p.*, i.number AS invoice_number FROM payments p
        LEFT JOIN invoices i ON i.id = p.invoice_id
        WHERE p.deleted_at IS NULL AND (
          p.order_id = ${id}
          OR p.invoice_id IN (SELECT id FROM invoices WHERE order_id = ${id} AND deleted_at IS NULL)
        )
        ORDER BY p.paid_date DESC, p.id DESC`,
    sql`SELECT * FROM invoices WHERE order_id = ${id} AND deleted_at IS NULL ORDER BY created_at DESC`,
    sql`SELECT * FROM activity WHERE entity = 'order' AND entity_id = ${id} ORDER BY created_at DESC LIMIT 25`,
    order.customer_id
      ? sql`SELECT c.*,
            (SELECT COUNT(*)::int FROM orders WHERE customer_id = c.id AND deleted_at IS NULL) AS order_count,
            (SELECT COALESCE(SUM(total),0)::numeric FROM orders WHERE customer_id = c.id AND deleted_at IS NULL AND status IN ('delivered','picked_up')) AS lifetime
          FROM customers c WHERE c.id = ${order.customer_id}`
      : Promise.resolve([]),
    sql`SELECT id, name, phone, email, type FROM customers WHERE deleted_at IS NULL ORDER BY name ASC`,
    sql`SELECT id, name FROM users ORDER BY name ASC`,
  ]);

  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const invoicesWithTotals = invoices.map((inv) => ({
    ...inv,
    computed_total: invoiceTotals(inv).total,
  }));

  const plain = (x) => JSON.parse(JSON.stringify(x));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <OrderDetail
          order={plain(order)}
          payments={plain(payments)}
          invoices={plain(invoicesWithTotals)}
          activity={plain(activity)}
          customer={customer[0] ? plain(customer[0]) : null}
          customers={plain(customers)}
          users={plain(users)}
          paid={paid}
        />
      </div>
    </>
  );
}
