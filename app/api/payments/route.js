import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function syncOrderPaymentStatus(sql, orderId) {
  if (!orderId) return;
  const [order] = await sql`SELECT total FROM orders WHERE id = ${orderId}`;
  if (!order) return;
  const [paid] = await sql`SELECT COALESCE(SUM(amount),0)::numeric AS s FROM payments WHERE order_id = ${orderId}`;
  const total = Number(order.total) || 0;
  const sum = Number(paid.s) || 0;
  let status = "unpaid";
  if (sum > 0 && (total === 0 || sum >= total)) status = "paid";
  else if (sum > 0) status = "deposit";
  await sql`UPDATE orders SET payment_status = ${status} WHERE id = ${orderId}`;
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
  const rows = await sql`
    INSERT INTO payments (order_id, invoice_id, customer_name, amount, method, paid_date, reference, notes)
    VALUES (${orderId},
            ${b.invoice_id ? parseInt(b.invoice_id, 10) : null},
            ${String(b.customer_name || "").trim()},
            ${amount},
            ${b.method || "cash"},
            ${b.paid_date || new Date().toISOString().slice(0, 10)},
            ${String(b.reference || "").trim()},
            ${String(b.notes || "").trim()})
    RETURNING id`;
  await syncOrderPaymentStatus(sql, orderId);
  if (b.invoice_id) {
    await sql`UPDATE invoices SET status = 'paid' WHERE id = ${parseInt(b.invoice_id, 10)}`;
  }
  return NextResponse.json({ ok: true, id: rows[0].id });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  const [before] = await sql`SELECT order_id FROM payments WHERE id = ${b.id}`;
  await sql`UPDATE payments SET
    amount = ${Number(b.amount) || 0},
    method = ${b.method || "cash"},
    paid_date = ${b.paid_date || new Date().toISOString().slice(0, 10)},
    customer_name = ${String(b.customer_name || "").trim()},
    order_id = ${b.order_id ? parseInt(b.order_id, 10) : null},
    reference = ${String(b.reference || "").trim()},
    notes = ${String(b.notes || "").trim()}
    WHERE id = ${b.id}`;
  await syncOrderPaymentStatus(sql, before?.order_id);
  if (b.order_id && Number(b.order_id) !== Number(before?.order_id)) {
    await syncOrderPaymentStatus(sql, parseInt(b.order_id, 10));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 400 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  const [before] = await sql`SELECT order_id FROM payments WHERE id = ${b.id}`;
  await sql`DELETE FROM payments WHERE id = ${b.id}`;
  await syncOrderPaymentStatus(sql, before?.order_id);
  return NextResponse.json({ ok: true });
}
