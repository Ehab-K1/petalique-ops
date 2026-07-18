import { invoiceTotals } from "./db";

/*
 * The sync engine — the glue that makes every page agree with every other page.
 *
 *  - findOrCreateCustomer: every order/invoice, whether typed by staff or
 *    submitted through the public web form, is matched to a customer record
 *    (by phone, then email, then name) or gets one created. This is what makes
 *    the Customers page a real CRM instead of an empty list.
 *  - syncOrderPayment: an order's payment status is always derived from the
 *    actual payments recorded against it — including payments recorded against
 *    an invoice that is linked to the order.
 *  - syncInvoicePayment: an invoice's status moves to partial/paid based on
 *    real recorded payments, and pushes the result through to its linked order.
 */

export function normPhone(p) {
  return String(p || "").replace(/[^0-9]/g, "");
}

export async function findOrCreateCustomer(sql, { name, phone, email, type = "retail", company = "" }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;
  const cleanPhone = String(phone || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const digits = normPhone(cleanPhone);

  let match = null;
  if (digits.length >= 7) {
    const rows = await sql`SELECT id, phone, email FROM customers
      WHERE deleted_at IS NULL
        AND regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') = ${digits}
      LIMIT 1`;
    match = rows[0] || null;
  }
  if (!match && cleanEmail) {
    const rows = await sql`SELECT id, phone, email FROM customers
      WHERE deleted_at IS NULL AND lower(trim(email)) = ${cleanEmail} LIMIT 1`;
    match = rows[0] || null;
  }
  if (!match) {
    const rows = await sql`SELECT id, phone, email FROM customers
      WHERE deleted_at IS NULL AND lower(trim(name)) = ${cleanName.toLowerCase()} LIMIT 1`;
    match = rows[0] || null;
  }

  if (match) {
    // fill in contact details we just learned
    if ((cleanPhone && !match.phone) || (cleanEmail && !match.email)) {
      await sql`UPDATE customers SET
        phone = CASE WHEN COALESCE(phone,'') = '' THEN ${cleanPhone} ELSE phone END,
        email = CASE WHEN COALESCE(email,'') = '' THEN ${cleanEmail} ELSE email END
        WHERE id = ${match.id}`;
    }
    return match.id;
  }

  const rows = await sql`INSERT INTO customers (name, phone, email, type, company)
    VALUES (${cleanName}, ${cleanPhone}, ${cleanEmail}, ${type}, ${String(company || "").trim()})
    RETURNING id`;
  return rows[0].id;
}

/* Sum of live payments attached to an order — directly, or via a linked invoice. */
export async function orderPaidTotal(sql, orderId) {
  const [row] = await sql`SELECT COALESCE(SUM(p.amount),0)::numeric AS s
    FROM payments p
    WHERE p.deleted_at IS NULL AND (
      p.order_id = ${orderId}
      OR p.invoice_id IN (SELECT id FROM invoices WHERE order_id = ${orderId} AND deleted_at IS NULL)
    )`;
  return Number(row?.s || 0);
}

export async function syncOrderPayment(sql, orderId) {
  if (!orderId) return;
  const [order] = await sql`SELECT id, total, payment_status FROM orders WHERE id = ${orderId}`;
  if (!order) return;
  const total = Number(order.total) || 0;
  const paid = await orderPaidTotal(sql, orderId);
  let status = "unpaid";
  if (paid > 0 && (total === 0 || paid >= total - 0.005)) status = "paid";
  else if (paid > 0) status = "deposit";
  if (status !== order.payment_status) {
    await sql`UPDATE orders SET payment_status = ${status} WHERE id = ${orderId}`;
  }
  return status;
}

export async function syncInvoicePayment(sql, invoiceId) {
  if (!invoiceId) return;
  const [inv] = await sql`SELECT * FROM invoices WHERE id = ${invoiceId}`;
  if (!inv) return;
  const [row] = await sql`SELECT COALESCE(SUM(amount),0)::numeric AS s
    FROM payments WHERE invoice_id = ${invoiceId} AND deleted_at IS NULL`;
  const paid = Number(row?.s || 0);
  const { total } = invoiceTotals(inv);

  // Only quotes stay out of the paid/partial flow; invoices track real money.
  if (inv.kind === "invoice") {
    let status = inv.status;
    if (paid >= total - 0.005 && total > 0) status = "paid";
    else if (paid > 0) status = "partial";
    else if (["paid", "partial"].includes(inv.status)) status = "sent";
    if (status !== inv.status) {
      await sql`UPDATE invoices SET status = ${status} WHERE id = ${invoiceId}`;
    }
  }
  if (inv.order_id) await syncOrderPayment(sql, inv.order_id);
  return { paid, total, balance: Math.max(0, total - paid) };
}

/* Resolve which customer a payment belongs to, from its links. */
export async function paymentCustomerId(sql, { customer_id, order_id, invoice_id }) {
  if (customer_id) return parseInt(customer_id, 10);
  if (order_id) {
    const [o] = await sql`SELECT customer_id FROM orders WHERE id = ${order_id}`;
    if (o?.customer_id) return o.customer_id;
  }
  if (invoice_id) {
    const [i] = await sql`SELECT customer_id FROM invoices WHERE id = ${invoice_id}`;
    if (i?.customer_id) return i.customer_id;
  }
  return null;
}
