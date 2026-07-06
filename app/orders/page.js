import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import OrdersClient from "@/components/OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await requireUser();
  const sql = await db();

  const orders = await sql`
    SELECT o.*, u.name AS assigned_name FROM orders o
    LEFT JOIN users u ON u.id = o.assigned_user_id
    ORDER BY (o.status IN ('delivered','picked_up','cancelled')) ASC, o.delivery_date ASC, o.delivery_time ASC
    LIMIT 400`;

  const customers = await sql`SELECT id, name, phone, type FROM customers ORDER BY name ASC`;
  const users = await sql`SELECT id, name FROM users ORDER BY name ASC`;

  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Orders</div>
        <div className="page-sub">
          Every delivery and pickup in one place: who, what, when, where, who sold it, paid or not.
        </div>
        <OrdersClient orders={plain(orders)} customers={plain(customers)} users={plain(users)} />
      </div>
    </>
  );
}
