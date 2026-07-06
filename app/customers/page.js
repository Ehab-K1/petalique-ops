import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import CustomersClient from "@/components/CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requireUser();
  const sql = await db();

  const customers = await sql`
    SELECT c.*,
      COALESCE(o.order_count, 0)::int AS order_count,
      COALESCE(o.lifetime, 0)::numeric AS lifetime,
      o.last_order
    FROM customers c
    LEFT JOIN (
      SELECT customer_id,
        COUNT(*) AS order_count,
        SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END) AS lifetime,
        MAX(delivery_date) AS last_order
      FROM orders
      WHERE customer_id IS NOT NULL
      GROUP BY customer_id
    ) o ON o.customer_id = c.id
    ORDER BY c.name ASC
    LIMIT 500`;

  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Customers</div>
        <div className="page-sub">
          Retail buyers, event planners, venues, and wholesale accounts, with order history in one place.
        </div>
        <CustomersClient customers={plain(customers)} />
      </div>
    </>
  );
}
