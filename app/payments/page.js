import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import PaymentsClient from "@/components/PaymentsClient";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const user = await requireUser();
  const sql = await db();

  const payments = await sql`
    SELECT p.*, o.customer_name AS order_customer, o.delivery_date AS order_date
    FROM payments p
    LEFT JOIN orders o ON o.id = p.order_id
    ORDER BY p.paid_date DESC, p.id DESC
    LIMIT 400`;

  const openOrders = await sql`
    SELECT id, customer_name, delivery_date, total, payment_status FROM orders
    WHERE status <> 'cancelled'
    ORDER BY delivery_date DESC
    LIMIT 200`;

  const monthTotal = await sql`
    SELECT COALESCE(SUM(amount),0)::numeric AS s, COUNT(*)::int AS c FROM payments
    WHERE paid_date >= date_trunc('month', CURRENT_DATE)`;

  const byMethod = await sql`
    SELECT method, COALESCE(SUM(amount),0)::numeric AS s FROM payments
    WHERE paid_date >= CURRENT_DATE - 30
    GROUP BY method ORDER BY s DESC`;

  const outstanding = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS s, COUNT(*)::int AS c
    FROM orders WHERE payment_status <> 'paid' AND status <> 'cancelled'`;

  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Payments</div>
        <div className="page-sub">
          Every dollar that comes in — cash, e-transfer, or card — logged against its order.
        </div>
        <PaymentsClient
          payments={plain(payments)}
          openOrders={plain(openOrders)}
          monthTotal={plain(monthTotal)[0]}
          byMethod={plain(byMethod)}
          outstanding={plain(outstanding)[0]}
        />
      </div>
    </>
  );
}
