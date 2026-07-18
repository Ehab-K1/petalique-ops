import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db, getBusiness } from "@/lib/db";
import InvoicesClient from "@/components/InvoicesClient";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const user = await requireUser();
  const sql = await db();

  const invoices = await sql`
    SELECT i.*, COALESCE(pp.paid, 0)::numeric AS paid
    FROM invoices i
    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS paid FROM payments
      WHERE deleted_at IS NULL AND invoice_id IS NOT NULL GROUP BY invoice_id
    ) pp ON pp.invoice_id = i.id
    WHERE i.deleted_at IS NULL
    ORDER BY i.created_at DESC
    LIMIT 300`;

  const customers = await sql`SELECT id, name, phone, email FROM customers WHERE deleted_at IS NULL ORDER BY name ASC`;
  const orders = await sql`
    SELECT id, customer_id, customer_name, delivery_date, total, items_desc FROM orders
    WHERE status <> 'cancelled' AND deleted_at IS NULL
    ORDER BY delivery_date DESC LIMIT 200`;
  const business = await getBusiness(sql);

  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Invoices &amp; quotations</div>
        <div className="page-sub">
          Share as a link or PDF. Record payments against them and the invoice, its order, and the dashboard all update together.
        </div>
        <InvoicesClient
          invoices={plain(invoices)}
          customers={plain(customers)}
          orders={plain(orders)}
          defaultTax={Number(business.tax_rate) || 0}
        />
      </div>
    </>
  );
}
