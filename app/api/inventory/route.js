import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function guard() {
  const user = await getSessionUser();
  if (!user) return null;
  return user;
}

export async function POST(request) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.variety || !b.quantity || !b.intake_date) {
    return NextResponse.json({ error: "Variety, quantity, and intake date are required." }, { status: 400 });
  }
  const sql = await db();
  const qty = Math.max(0, parseInt(b.quantity, 10) || 0);
  const rows = await sql`
    INSERT INTO inventory_batches (variety, quantity, initial_quantity, unit_cost, intake_date, source)
    VALUES (${String(b.variety).trim()}, ${qty}, ${qty},
            ${b.unit_cost === "" || b.unit_cost == null ? null : Number(b.unit_cost)},
            ${b.intake_date}, ${String(b.source || "").trim()})
    RETURNING id`;
  return NextResponse.json({ ok: true, id: rows[0].id });
}

export async function PATCH(request) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();

  if (b.edit) {
    if (!b.variety || !b.intake_date) {
      return NextResponse.json({ error: "Variety and intake date are required." }, { status: 400 });
    }
    await sql`UPDATE inventory_batches SET
      variety = ${String(b.variety).trim()},
      quantity = ${Math.max(0, parseInt(b.quantity, 10) || 0)},
      unit_cost = ${b.unit_cost === "" || b.unit_cost == null ? null : Number(b.unit_cost)},
      intake_date = ${b.intake_date},
      source = ${String(b.source || "").trim()}
      WHERE id = ${b.id}`;
    return NextResponse.json({ ok: true });
  }

  if (b.quantity !== undefined) {
    await sql`UPDATE inventory_batches SET quantity = ${Math.max(0, parseInt(b.quantity, 10) || 0)} WHERE id = ${b.id}`;
  }
  if (b.status !== undefined) {
    await sql`UPDATE inventory_batches SET status = ${b.status} WHERE id = ${b.id}`;
  }
  if (b.assigned_order_id !== undefined) {
    const v = b.assigned_order_id === null || b.assigned_order_id === "" ? null : parseInt(b.assigned_order_id, 10);
    await sql`UPDATE inventory_batches
      SET assigned_order_id = ${v}, status = ${v ? "reserved" : "available"}
      WHERE id = ${b.id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  await sql`DELETE FROM inventory_batches WHERE id = ${b.id}`;
  return NextResponse.json({ ok: true });
}
