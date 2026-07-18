import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { findOrCreateCustomer, syncOrderPayment } from "@/lib/sync";

const STATUS_LABEL = {
  pending: "Pending", confirmed: "Confirmed", prepping: "Prepping",
  out_for_delivery: "Out for delivery", ready_for_pickup: "Ready for pickup",
  delivered: "Delivered", picked_up: "Picked up", cancelled: "Cancelled",
};

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.customer_name || !b.delivery_date) {
    return NextResponse.json({ error: "Customer name and date are required." }, { status: 400 });
  }
  const sql = await db();

  // Every order gets a customer record — matched or created.
  let customerId = b.customer_id ? parseInt(b.customer_id, 10) : null;
  if (!customerId) {
    customerId = await findOrCreateCustomer(sql, {
      name: b.customer_name, phone: b.phone, email: b.email,
      type: b.order_type === "wholesale" ? "wholesale" : "retail",
    });
  }

  const rows = await sql`
    INSERT INTO orders (customer_id, customer_name, phone, email, order_type, items_desc,
                        delivery_date, delivery_time, address, payment_status, total, notes,
                        fulfillment_type, assigned_user_id, occasion, source)
    VALUES (${customerId},
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
  const id = rows[0].id;
  await logActivity(sql, user, "created", "order", id,
    `created order #${id} — ${String(b.customer_name).trim()}, ${b.delivery_date}`);
  return NextResponse.json({ ok: true, id, customer_id: customerId });
}

const DONE_STATUSES = ["delivered", "picked_up"];

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  const id = parseInt(b.id, 10);

  try {

  if (b.restore) {
    await sql`UPDATE orders SET deleted_at = NULL WHERE id = ${id}`;
    await logActivity(sql, user, "restored", "order", id, `restored order #${id}`);
    return NextResponse.json({ ok: true });
  }

  if (b.status !== undefined) {
    const [prev] = await sql`SELECT status, customer_name FROM orders WHERE id = ${id}`;
    await sql`UPDATE orders SET status = ${b.status}, updated_at = now() WHERE id = ${id}`;
    if (DONE_STATUSES.includes(b.status)) {
      await sql`UPDATE inventory_batches SET status = 'used' WHERE assigned_order_id = ${id} AND status = 'reserved'`;
    }
    if (b.status === "cancelled") {
      await sql`UPDATE inventory_batches SET status = 'available', assigned_order_id = NULL WHERE assigned_order_id = ${id} AND status = 'reserved'`;
    }
    if (prev && prev.status !== b.status) {
      await logActivity(sql, user, "status", "order", id,
        `moved order #${id} (${prev.customer_name}) to ${STATUS_LABEL[b.status] || b.status}`);
    }
  }
  if (b.payment_status !== undefined) {
    await sql`UPDATE orders SET payment_status = ${b.payment_status}, updated_at = now() WHERE id = ${id}`;
    await logActivity(sql, user, "payment_status", "order", id,
      `marked order #${id} ${b.payment_status}`);
  }
  if (b.assigned_user_id !== undefined) {
    const v = b.assigned_user_id === null || b.assigned_user_id === "" ? null : parseInt(b.assigned_user_id, 10);
    await sql`UPDATE orders SET assigned_user_id = ${v}, updated_at = now() WHERE id = ${id}`;
  }

  // full edit — sent by the edit form
  if (b.edit) {
    let customerId = b.customer_id ? parseInt(b.customer_id, 10) : null;
    if (!customerId) {
      customerId = await findOrCreateCustomer(sql, {
        name: b.customer_name, phone: b.phone, email: b.email,
        type: b.order_type === "wholesale" ? "wholesale" : "retail",
      });
    }
    await sql`UPDATE orders SET
      customer_id = ${customerId},
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
      occasion = ${String(b.occasion || "").trim()},
      updated_at = now()
      WHERE id = ${id}`;
    // total may have changed — re-derive payment status from real payments
    await syncOrderPayment(sql, id);
    await logActivity(sql, user, "updated", "order", id,
      `updated order #${id} — ${String(b.customer_name || "").trim()}`);
  }
  return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("orders PATCH error", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  const [o] = await sql`SELECT customer_name FROM orders WHERE id = ${b.id}`;
  await sql`UPDATE inventory_batches SET status = 'available', assigned_order_id = NULL WHERE assigned_order_id = ${b.id}`;
  await sql`UPDATE orders SET deleted_at = now() WHERE id = ${b.id}`;
  await logActivity(sql, user, "deleted", "order", parseInt(b.id, 10),
    `moved order #${b.id}${o ? ` (${o.customer_name})` : ""} to trash`);
  return NextResponse.json({ ok: true, undoable: true });
}
