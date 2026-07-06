import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function clean(b) {
  return {
    category: String(b.category || "other"),
    description: String(b.description || "").trim(),
    vendor: String(b.vendor || "").trim(),
    amount: Number(b.amount) || 0,
    expense_date: b.expense_date || new Date().toISOString().slice(0, 10),
    method: String(b.method || "").trim(),
    recurring: Boolean(b.recurring),
    notes: String(b.notes || "").trim(),
  };
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  const e = clean(b);
  if (!e.description) return NextResponse.json({ error: "A description is required." }, { status: 400 });
  if (!e.amount || e.amount <= 0) return NextResponse.json({ error: "A positive amount is required." }, { status: 400 });
  const sql = await db();
  const rows = await sql`
    INSERT INTO expenses (category, description, vendor, amount, expense_date, method, recurring, notes)
    VALUES (${e.category}, ${e.description}, ${e.vendor}, ${e.amount}, ${e.expense_date},
            ${e.method}, ${e.recurring}, ${e.notes})
    RETURNING id`;
  return NextResponse.json({ ok: true, id: rows[0].id });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const e = clean(b);
  if (!e.description) return NextResponse.json({ error: "A description is required." }, { status: 400 });
  if (!e.amount || e.amount <= 0) return NextResponse.json({ error: "A positive amount is required." }, { status: 400 });
  const sql = await db();
  await sql`UPDATE expenses SET
    category = ${e.category},
    description = ${e.description},
    vendor = ${e.vendor},
    amount = ${e.amount},
    expense_date = ${e.expense_date},
    method = ${e.method},
    recurring = ${e.recurring},
    notes = ${e.notes}
    WHERE id = ${b.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  await sql`DELETE FROM expenses WHERE id = ${b.id}`;
  return NextResponse.json({ ok: true });
}
