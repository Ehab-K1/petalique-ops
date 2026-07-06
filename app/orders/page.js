import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import OrdersClient from "@/components/OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await requireUser();
  const sql = await db();

  const orders = await sql`
    SELECT * FROM orders
    ORDER BY (status IN ('delivered','cancelled')) ASC, delivery_date ASC, delivery_time ASC
    LIMIT 300`;

  const customers = await sql`SELECT id, name, phone, type FROM customers ORDER BY name ASC`;

  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Deliveries and orders</div>
        <div className="page-sub">
          Every order in one place: who, what, when, where, paid or not. No more spreadsheet and group chat.
        </div>
        <OrdersClient orders={plain(orders)} customers={plain(customers)} />
      </div>
    </>
  );
}
