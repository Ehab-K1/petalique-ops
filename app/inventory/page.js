import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import InventoryClient from "@/components/InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = await requireUser();
  const sql = await db();

  const batches = await sql`
    SELECT * FROM inventory_batches
    ORDER BY (status = 'available') DESC, intake_date ASC, id DESC
    LIMIT 300`;

  const openOrders = await sql`
    SELECT id, customer_name, delivery_date FROM orders
    WHERE status NOT IN ('delivered','cancelled')
    ORDER BY delivery_date ASC`;

  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Inventory</div>
        <div className="page-sub">
          Log every intake, watch freshness, and assign stems to orders so nothing is sold twice or forgotten.
        </div>
        <InventoryClient batches={plain(batches)} openOrders={plain(openOrders)} />
      </div>
    </>
  );
}
