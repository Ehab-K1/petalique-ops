import Nav from "@/components/Nav";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db, invoiceTotals } from "@/lib/db";
import CustomerDetail from "@/components/CustomerDetail";

export const dynamic = "force-dynamic";

/*
 * Customer 360 — everything the studio knows about one person: orders,
 * invoices, payments, lifetime value, notes and history, all cross-linked.
 */
export default async function CustomerDetailPage({ params }) {
  const user = await requireUser();
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();
  const sql = await db();

  const [customer] = await sql`SELECT * FROM customers WHERE id = ${id}`;
  if (!customer) notFound();

  if (customer.deleted_at) {
    return (
      <>
        <Nav user={user} />
        <div className="page">
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <div className="page-title">{customer.name} is in the trash</div>
            <p className="muted" style={{ marginBottom: 16 }}>
              An admin can restore this customer from Settings → Trash.
            </p>
            <Link href="/customers" className="btn">← Back to customers</Link>
          </div>
        </div>
      </>
    );
  }

  const [orders, invoices, payments, activity, allCustomers] = await Promise.all([
    sql`SELECT o.*, u.name AS assigned_name FROM orders o
        LEFT JOIN users u ON u.id = o.assigned_user_id
        WHERE o.customer_id = ${id} AND o.deleted_at IS NULL
        ORDER BY o.delivery_date DESC LIMIT 100`,
    sql`SELECT * FROM invoices WHERE customer_id = ${id} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT p.*, i.number AS invoice_number FROM payments p
        LEFT JOIN invoices i ON i.id = p.invoice_id
        WHERE p.deleted_at IS NULL AND (
          p.customer_id = ${id}
          OR p.order_id IN (SELECT id FROM orders WHERE customer_id = ${id})
          OR p.invoice_id IN (SELECT id FROM invoices WHERE customer_id = ${id})
        )
        ORDER BY p.paid_date DESC LIMIT 100`,
    sql`SELECT * FROM activity WHERE entity = 'customer' AND entity_id = ${id} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT id, name FROM customers WHERE deleted_at IS NULL AND id <> ${id} ORDER BY name ASC`,
  ]);

  const delivered = orders.filter((o) => ["delivered", "picked_up"].includes(o.status));
  const lifetime = delivered.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const openOrders = orders.filter((o) => !["delivered", "picked_up", "cancelled"].includes(o.status));
  const stats = {
    lifetime,
    totalPaid,
    orderCount: orders.length,
    openCount: openOrders.length,
    avgOrder: delivered.length > 0 ? lifetime / delivered.length : 0,
    firstOrder: orders.length ? orders[orders.length - 1].delivery_date : null,
    lastOrder: orders.length ? orders[0].delivery_date : null,
  };

  const invoicesWithTotals = invoices.map((inv) => ({ ...inv, computed_total: invoiceTotals(inv).total }));
  const plain = (x) => JSON.parse(JSON.stringify(x));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <CustomerDetail
          customer={plain(customer)}
          orders={plain(orders)}
          invoices={plain(invoicesWithTotals)}
          payments={plain(payments)}
          activity={plain(activity)}
          allCustomers={plain(allCustomers)}
          stats={plain(stats)}
          isAdmin={user.role === "admin"}
        />
      </div>
    </>
  );
}
