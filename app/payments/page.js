import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db, invoiceTotals } from "@/lib/db";
import PaymentsClient from "@/components/PaymentsClient";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const user = await requireUser();
  const sql = await db();

  const payments = await sql`
    SELECT p.*, o.customer_name AS order_customer, o.delivery_date AS order_date,
           i.number AS invoice_number, c.name AS linked_customer
    FROM payments p
    LEFT JOIN orders o ON o.id = p.order_id
    LEFT JOIN invoices i ON i.id = p.invoice_id
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.deleted_at IS NULL
    ORDER BY p.paid_date DESC, p.id DESC
    LIMIT 400`;

  const orders = await sql`
    SELECT id, customer_id, customer_name, delivery_date, total, payment_status FROM orders
    WHERE status <> 'cancelled' AND deleted_at IS NULL
    ORDER BY delivery_date DESC
    LIMIT 250`;

  const openInvoicesRaw = await sql`
    SELECT i.*, COALESCE(pp.paid, 0)::numeric AS paid
    FROM invoices i
    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS paid FROM payments
      WHERE deleted_at IS NULL AND invoice_id IS NOT NULL GROUP BY invoice_id
    ) pp ON pp.invoice_id = i.id
    WHERE i.deleted_at IS NULL AND i.status NOT IN ('void')
    ORDER BY i.created_at DESC LIMIT 150`;

  const openInvoices = openInvoicesRaw.map((inv) => {
    const t = invoiceTotals(inv);
    return {
      id: inv.id, number: inv.number, kind: inv.kind, status: inv.status,
      customer_id: inv.customer_id, customer_name: inv.customer_name,
      order_id: inv.order_id, total: t.total, paid: Number(inv.paid) || 0,
      balance: Math.max(0, t.total - (Number(inv.paid) || 0)),
    };
  });

  const monthTotal = await sql`
    SELECT COALESCE(SUM(amount),0)::numeric AS s, COUNT(*)::int AS c FROM payments
    WHERE deleted_at IS NULL AND paid_date >= date_trunc('month', CURRENT_DATE)`;

  const byMethod = await sql`
    SELECT method, COALESCE(SUM(amount),0)::numeric AS s FROM payments
    WHERE deleted_at IS NULL AND paid_date >= CURRENT_DATE - 30
    GROUP BY method ORDER BY s DESC`;

  const outstanding = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS s, COUNT(*)::int AS c
    FROM orders WHERE payment_status <> 'paid' AND status <> 'cancelled' AND deleted_at IS NULL`;

  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Payments</div>
        <div className="page-sub">
          Every dollar in. Link a payment to an order or invoice and their statuses update themselves — everywhere.
        </div>
        <PaymentsClient
          payments={plain(payments)}
          orders={plain(orders)}
          invoices={plain(openInvoices)}
          monthTotal={plain(monthTotal)[0]}
          byMethod={plain(byMethod)}
          outstanding={plain(outstanding)[0]}
        />
      </div>
    </>
  );
}
