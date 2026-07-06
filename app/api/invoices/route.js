import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      desc: String(it.desc || "").trim(),
      qty: Math.max(0, Number(it.qty) || 0),
      price: Math.max(0, Number(it.price) || 0),
    }))
    .filter((it) => it.desc);
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.customer_name) {
    return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
  }
  const items = cleanItems(b.items);
  if (items.length === 0) {
    return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
  }
  const sql = await db();
  const kind = b.kind === "quote" ? "quote" : "invoice";
  const year = new Date().getFullYear();
  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM invoices WHERE kind = ${kind}`;
  const number = `${kind === "quote" ? "QUO" : "INV"}-${year}-${String(c + 1).padStart(3, "0")}`;
  const token = crypto.randomBytes(16).toString("hex");

  const rows = await sql`
    INSERT INTO invoices (number, kind, status, customer_id, customer_name, customer_email,
                          customer_phone, customer_address, order_id, items, tax_rate, discount,
                          issue_date, due_date, notes, token)
    VALUES (${number}, ${kind}, ${"draft"},
            ${b.customer_id ? parseInt(b.customer_id, 10) : null},
            ${String(b.customer_name).trim()},
            ${String(b.customer_email || "").trim()},
            ${String(b.customer_phone || "").trim()},
            ${String(b.customer_address || "").trim()},
            ${b.order_id ? parseInt(b.order_id, 10) : null},
            ${JSON.stringify(items)},
            ${Number(b.tax_rate) || 0},
            ${Number(b.discount) || 0},
            ${b.issue_date || new Date().toISOString().slice(0, 10)},
            ${b.due_date || null},
            ${String(b.notes || "").trim()},
            ${token})
    RETURNING id, number, token`;
  return NextResponse.json({ ok: true, ...rows[0] });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();

  if (b.status !== undefined) {
    await sql`UPDATE invoices SET status = ${b.status} WHERE id = ${b.id}`;
  }

  if (b.edit) {
    const items = cleanItems(b.items);
    if (!b.customer_name || items.length === 0) {
      return NextResponse.json({ error: "Customer name and at least one item are required." }, { status: 400 });
    }
    await sql`UPDATE invoices SET
      customer_name = ${String(b.customer_name).trim()},
      customer_email = ${String(b.customer_email || "").trim()},
      customer_phone = ${String(b.customer_phone || "").trim()},
      customer_address = ${String(b.customer_address || "").trim()},
      order_id = ${b.order_id ? parseInt(b.order_id, 10) : null},
      items = ${JSON.stringify(items)},
      tax_rate = ${Number(b.tax_rate) || 0},
      discount = ${Number(b.discount) || 0},
      issue_date = ${b.issue_date || new Date().toISOString().slice(0, 10)},
      due_date = ${b.due_date || null},
      notes = ${String(b.notes || "").trim()}
      WHERE id = ${b.id}`;
  }

  // convert quote → invoice
  if (b.convert) {
    const [inv] = await sql`SELECT * FROM invoices WHERE id = ${b.id} AND kind = 'quote'`;
    if (!inv) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    const year = new Date().getFullYear();
    const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM invoices WHERE kind = 'invoice'`;
    const number = `INV-${year}-${String(c + 1).padStart(3, "0")}`;
    const token = crypto.randomBytes(16).toString("hex");
    const rows = await sql`
      INSERT INTO invoices (number, kind, status, customer_id, customer_name, customer_email,
                            customer_phone, customer_address, order_id, items, tax_rate, discount,
                            issue_date, due_date, notes, token)
      VALUES (${number}, ${"invoice"}, ${"draft"}, ${inv.customer_id}, ${inv.customer_name},
              ${inv.customer_email}, ${inv.customer_phone}, ${inv.customer_address}, ${inv.order_id},
              ${JSON.stringify(inv.items)}, ${inv.tax_rate}, ${inv.discount},
              ${new Date().toISOString().slice(0, 10)}, ${null}, ${inv.notes}, ${token})
      RETURNING id, number`;
    await sql`UPDATE invoices SET status = 'accepted' WHERE id = ${b.id}`;
    return NextResponse.json({ ok: true, ...rows[0] });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  await sql`DELETE FROM invoices WHERE id = ${b.id}`;
  return NextResponse.json({ ok: true });
}
