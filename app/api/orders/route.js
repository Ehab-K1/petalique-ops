import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.customer_name || !b.delivery_date) {
    return NextResponse.json({ error: "Customer name and date are required." }, { status: 400 });
  }
  const sql = await db();
  const rows = await sql`
    INSERT INTO orders (customer_id, customer_name, phone, email, order_type, items_desc,
                        delivery_date, delivery_time, address, payment_status, total, notes,
                        fulfillment_type, assigned_user_id, occasion, source)
    VALUES (${b.customer_id ? parseInt(b.customer_id, 10) : null},
            ${String(b.customer_name).trim()},
            ${String(b.phone || "").trim()},
            ${String(b.email || "").trim()},
            ${b.order_type || "retail"},
            ${String(b.items_desc || "").trim()},
            ${b.delivery_date},
            ${String(b.delivery_time || "")},
            ${String(b.address || "").trim()},
            ${b.payment_status || "unpaid"},
            ${b.total === "" || b.total == null ? 0 : Number(b.total)},
            ${String(b.notes || "").trim()},
            ${b.fulfillment_type === "pickup" ? "pickup" : "delivery"},
            ${b.assigned_user_id ? parseInt(b.assigned_user_id, 10) : null},
            ${String(b.occasion || "").trim()},
            ${"staff"})
    RETURNING id`;
  return NextResponse.json({ ok: true, id: rows[0].id });
}

const DONE_STATUSES = ["delivered", "picked_up"];

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  const id = parseInt(b.id, 10);

  if (b.status !== undefined) {
    await sql`UPDATE orders SET status = ${b.status} WHERE id = ${id}`;
    if (DONE_STATUSES.includes(b.status)) {
      await sql`UPDATE inventory_batches SET status = 'used' WHERE assigned_order_id = ${id} AND status = 'reserved'`;
    }
    if (b.status === "cancelled") {
      await sql`UPDATE inventory_batches SET status = 'available', assigned_order_id = NULL WHERE assigned_order_id = ${id} AND status = 'reserved'`;
    }
  }
  if (b.payment_status !== undefined) {
    await sql`UPDATE orders SET payment_status = ${b.payment_status} WHERE id = ${id}`;
  }
  if (b.assigned_user_id !== undefined) {
    const v = b.assigned_user_id === null || b.assigned_user_id === "" ? null : parseInt(b.assigned_user_id, 10);
    await sql`UPDATE orders SET assigned_user_id = ${v} WHERE id = ${id}`;
  }

  // full edit — sent by the edit modal
  if (b.edit) {
    await sql`UPDATE orders SET
      customer_id = ${b.customer_id ? parseInt(b.customer_id, 10) : null},
      customer_name = ${String(b.customer_name || "").trim()},
      phone = ${String(b.phone || "").trim()},
      email = ${String(b.email || "").trim()},
      order_type = ${b.order_type || "retail"},
      items_desc = ${String(b.items_desc || "").trim()},
      delivery_date = ${b.delivery_date},
      delivery_time = ${String(b.delivery_time || "")},
      address = ${String(b.address || "").trim()},
      total = ${b.total === "" || b.total == null ? 0 : Number(b.total)},
      notes = ${String(b.notes || "").trim()},
      fulfillment_type = ${b.fulfillment_type === "pickup" ? "pickup" : "delivery"},
      occasion = ${String(b.occasion || "").trim()}
      WHERE id = ${id}`;
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
