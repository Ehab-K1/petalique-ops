import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { syncOrderPayment, syncInvoicePayment, paymentCustomerId } from "@/lib/sync";

/* After any payment change, re-derive the status of everything it touches. */
async function resync(sql, { order_id, invoice_id }) {
  if (invoice_id) await syncInvoicePayment(sql, invoice_id); // also syncs its linked order
  if (order_id) await syncOrderPayment(sql, order_id);
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  const amount = Number(b.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "A positive amount is required." }, { status: 400 });
  }
  const sql = await db();
  const orderId = b.order_id ? parseInt(b.order_id, 10) : null;
  const invoiceId = b.invoice_id ? parseInt(b.invoice_id, 10) : null;
  const customerId = await paymentCustomerId(sql, { customer_id: b.customer_id, order_id: orderId, invoice_id: invoiceId });

  const rows = await sql`
    INSERT INTO payments (order_id, invoice_id, customer_id, customer_name, amount, method, paid_date, reference, notes)
    VALUES (${orderId}, ${invoiceId}, ${customerId},
            ${String(b.customer_name || "").trim()},
            ${amount},
            ${b.method || "cash"},
            ${b.paid_date || new Date().toISOString().slice(0, 10)},
            ${String(b.reference || "").trim()},
            ${String(b.notes || "").trim()})
    RETURNING id`;
  await resync(sql, { order_id: orderId, invoice_id: invoiceId });
  await logActivity(sql, user, "created", "payment", rows[0].id,
    `recorded $${amount.toFixed(2)} ${b.method || "cash"}${orderId ? ` on order #${orderId}` : ""}${invoiceId ? ` on invoice #${invoiceId}` : ""}`,
    { order_id: orderId, invoice_id: invoiceId });
  return NextResponse.json({ ok: true, id: rows[0].id });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();

  if (b.restore) {
    const [p] = await sql`UPDATE payments SET deleted_at = NULL WHERE id = ${b.id} RETURNING order_id, invoice_id`;
    if (p) await resync(sql, p);
    await logActivity(sql, user, "restored", "payment", parseInt(b.id, 10), `restored payment #${b.id}`);
    return NextResponse.json({ ok: true });
  }

  const [before] = await sql`SELECT order_id, invoice_id FROM payments WHERE id = ${b.id}`;
  const orderId = b.order_id ? parseInt(b.order_id, 10) : null;
  const invoiceId = b.invoice_id ? parseInt(b.invoice_id, 10) : null;
  const customerId = await paymentCustomerId(sql, { customer_id: b.customer_id, order_id: orderId, invoice_id: invoiceId });
  await sql`UPDATE payments SET
    amount = ${Number(b.amount) || 0},
    method = ${b.method || "cash"},
    paid_date = ${b.paid_date || new Date().toISOString().slice(0, 10)},
    customer_name = ${String(b.customer_name || "").trim()},
    customer_id = ${customerId},
    order_id = ${orderId},
    invoice_id = ${invoiceId},
    reference = ${String(b.reference || "").trim()},
    notes = ${String(b.notes || "").trim()}
    WHERE id = ${b.id}`;
  // resync everything the payment used to touch and now touches
  await resync(sql, { order_id: before?.order_id, invoice_id: before?.invoice_id });
  await resync(sql, { order_id: orderId, invoice_id: invoiceId });
  await logActivity(sql, user, "updated", "payment", parseInt(b.id, 10),
    `updated payment #${b.id} — $${(Number(b.amount) || 0).toFixed(2)}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  const [before] = await sql`SELECT order_id, invoice_id, amount FROM payments WHERE id = ${b.id}`;
  await sql`UPDATE payments SET deleted_at = now() WHERE id = ${b.id}`;
  if (before) await resync(sql, before);
  await logActivity(sql, user, "deleted", "payment", parseInt(b.id, 10),
    `moved payment #${b.id}${before ? ` ($${Number(before.amount).toFixed(2)})` : ""} to trash`);
  return NextResponse.json({ ok: true, undoable: true });
}
