import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.customer_name || !b.delivery_date) {
    return NextResponse.json({ error: "Customer name and delivery date are required." }, { status: 400 });
  }
  const sql = await db();
  const rows = await sql`
    INSERT INTO orders (customer_id, customer_name, phone, order_type, items_desc,
                        delivery_date, delivery_time, address, payment_status, total, notes)
    VALUES (${b.customer_id ? parseInt(b.customer_id, 10) : null},
            ${String(b.customer_name).trim()},
            ${String(b.phone || "").trim()},
            ${b.order_type || "retail"},
            ${String(b.items_desc || "").trim()},
            ${b.delivery_date},
            ${String(b.delivery_time || "")},
            ${String(b.address || "").trim()},
            ${b.payment_status || "unpaid"},
            ${b.total === "" || b.total == null ? 0 : Number(b.total)},
            ${String(b.notes || "").trim()})
    RETURNING id`;
  return NextResponse.json({ ok: true, id: rows[0].id });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();

  if (b.status !== undefined) {
    await sql`UPDATE orders SET status = ${b.status} WHERE id = ${b.id}`;
    if (b.status === "delivered") {
      await sql`UPDATE inventory_batches SET status = 'used' WHERE assigned_order_id = ${b.id} AND status = 'reserved'`;
    }
    if (b.status === "cancelled") {
      await sql`UPDATE inventory_batches SET status = 'available', assigned_order_id = NULL WHERE assigned_order_id = ${b.id} AND status = 'reserved'`;
    }
  }
  if (b.payment_status !== undefined) {
    await sql`UPDATE orders SET payment_status = ${b.payment_status} WHERE id = ${b.id}`;
  }
  if (b.total !== undefined) {
    await sql`UPDATE orders SET total = ${Number(b.total) || 0} WHERE id = ${b.id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  await sql`UPDATE inventory_batches SET status = 'available', assigned_order_id = NULL WHERE assigned_order_id = ${b.id}`;
  await sql`DELETE FROM orders WHERE id = ${b.id}`;
  return NextResponse.json({ ok: true });
}
