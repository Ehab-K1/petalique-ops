import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const sql = await db();
  const rows = await sql`
    INSERT INTO customers (name, phone, email, type, company, notes)
    VALUES (${String(b.name).trim()}, ${String(b.phone || "").trim()},
            ${String(b.email || "").trim().toLowerCase()},
            ${b.type || "retail"}, ${String(b.company || "").trim()},
            ${String(b.notes || "").trim()})
    RETURNING id`;
  await logActivity(sql, user, "created", "customer", rows[0].id,
    `added customer ${String(b.name).trim()}`);
  return NextResponse.json({ ok: true, id: rows[0].id });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  const id = parseInt(b.id, 10);

  try {

  if (b.restore) {
    await sql`UPDATE customers SET deleted_at = NULL WHERE id = ${id}`;
    await logActivity(sql, user, "restored", "customer", id, `restored customer #${id}`);
    return NextResponse.json({ ok: true });
  }

  // Merge duplicates: move every order, invoice and payment from `merge_from`
  // onto this customer, then trash the duplicate. Fixes double-entry mistakes
  // without losing any history.
  if (b.merge_from) {
    const fromId = parseInt(b.merge_from, 10);
    if (fromId === id) return NextResponse.json({ error: "Cannot merge a customer into itself." }, { status: 400 });
    const [keep] = await sql`SELECT * FROM customers WHERE id = ${id}`;
    const [dup] = await sql`SELECT * FROM customers WHERE id = ${fromId}`;
    if (!keep || !dup) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    await sql`UPDATE orders SET customer_id = ${id} WHERE customer_id = ${fromId}`;
    await sql`UPDATE invoices SET customer_id = ${id} WHERE customer_id = ${fromId}`;
    await sql`UPDATE payments SET customer_id = ${id} WHERE customer_id = ${fromId}`;
    // keep any contact info the duplicate had that the keeper lacks
    await sql`UPDATE customers SET
      phone = CASE WHEN COALESCE(phone,'') = '' THEN ${dup.phone || ""} ELSE phone END,
      email = CASE WHEN COALESCE(email,'') = '' THEN ${dup.email || ""} ELSE email END,
      company = CASE WHEN COALESCE(company,'') = '' THEN ${dup.company || ""} ELSE company END,
      notes = CASE WHEN COALESCE(${dup.notes || ""},'') = '' THEN notes
                   ELSE trim(both E'\n' from COALESCE(notes,'') || E'\n' || ${"[merged] " + (dup.notes || "")}) END
      WHERE id = ${id}`;
    await sql`UPDATE customers SET deleted_at = now() WHERE id = ${fromId}`;
    await logActivity(sql, user, "merged", "customer", id,
      `merged ${dup.name} into ${keep.name}`, { merged_from: fromId });
    return NextResponse.json({ ok: true });
  }

  if (b.edit) {
    if (!b.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    await sql`UPDATE customers SET
      name = ${String(b.name).trim()},
      phone = ${String(b.phone || "").trim()},
      email = ${String(b.email || "").trim().toLowerCase()},
      type = ${b.type || "retail"},
      company = ${String(b.company || "").trim()},
      notes = ${String(b.notes || "").trim()}
      WHERE id = ${id}`;
    await logActivity(sql, user, "updated", "customer", id,
      `updated customer ${String(b.name).trim()}`);
    return NextResponse.json({ ok: true });
  }

  if (b.notes !== undefined) {
    await sql`UPDATE customers SET notes = ${String(b.notes)} WHERE id = ${id}`;
  }
  if (b.type !== undefined) {
    await sql`UPDATE customers SET type = ${b.type} WHERE id = ${id}`;
  }
  return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("customers PATCH error", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  const [c] = await sql`UPDATE customers SET deleted_at = now() WHERE id = ${b.id} RETURNING name`;
  await logActivity(sql, user, "deleted", "customer", parseInt(b.id, 10),
    `moved customer ${c?.name || `#${b.id}`} to trash`);
  return NextResponse.json({ ok: true, undoable: true });
}
