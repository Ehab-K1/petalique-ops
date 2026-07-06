import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import InvoicesClient from "@/components/InvoicesClient";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const user = await requireUser();
  const sql = await db();

  const invoices = await sql`
    SELECT * FROM invoices
    ORDER BY created_at DESC
    LIMIT 300`;

  const customers = await sql`SELECT id, name, phone, email FROM customers ORDER BY name ASC`;
  const orders = await sql`
    SELECT id, customer_name, delivery_date, total, items_desc FROM orders
    WHERE status <> 'cancelled'
    ORDER BY delivery_date DESC LIMIT 200`;

  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Invoices &amp; quotations</div>
        <div className="page-sub">
          Create polished invoices and quotes, share them as a link, or export as PDF. Payments can be logged against them.
        </div>
        <InvoicesClient invoices={plain(invoices)} customers={plain(customers)} orders={plain(orders)} />
      </div>
    </>
  );
}
