import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

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
  return NextResponse.json({ ok: true, id: rows[0].id });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();

  if (b.edit) {
    if (!b.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    await sql`UPDATE customers SET
      name = ${String(b.name).trim()},
      phone = ${String(b.phone || "").trim()},
      email = ${String(b.email || "").trim().toLowerCase()},
      type = ${b.type || "retail"},
      company = ${String(b.company || "").trim()},
      notes = ${String(b.notes || "").trim()}
      WHERE id = ${b.id}`;
    return NextResponse.json({ ok: true });
  }

  if (b.notes !== undefined) {
    await sql`UPDATE customers SET notes = ${String(b.notes)} WHERE id = ${b.id}`;
  }
  if (b.type !== undefined) {
    await sql`UPDATE customers SET type = ${b.type} WHERE id = ${b.id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  await sql`DELETE FROM customers WHERE id = ${b.id}`;
  return NextResponse.json({ ok: true });
}
