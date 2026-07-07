import { NextResponse } from "next/server";
import crypto from "crypto";
import { db, invoiceTotals } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// This route reads raw Postgres rows directly, so DATE columns arrive as JS Date
// objects (not the ISO strings a client component would get after Next.js
// serializes props). String(dateObject).slice(0,10) silently produces garbage —
// that was the cause of "convert to order" failing whenever the invoice had a
// due date set. Same root cause as the Invalid Date PDF bug, different file.
function toISODate(d) {
  if (!d) return "";
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}

// items keep a flexible shape: {section, name, detail, qty, price}.
// `section` groups rows under a day/event header (e.g. "Friday, August 7, 2026").
// `detail` is the description line shown under the item name on the document.
// Older invoices saved as {desc, qty, price} still render fine — `name` falls
// back to `desc` wherever items are read.
function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      section: String(it.section || "").trim().slice(0, 100),
      name: String(it.name ?? it.desc ?? "").trim().slice(0, 160),
      detail: String(it.detail || "").trim().slice(0, 400),
      qty: Math.max(0, Number(it.qty) || 0),
      price: Math.max(0, Number(it.price) || 0),
    }))
    .filter((it) => it.name);
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
                          issue_date, due_date, event_date, deposit_pct, notes, token)
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
            ${String(b.event_date || "").trim().slice(0, 120)},
            ${Number(b.deposit_pct) || 0},
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

  try {

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
      event_date = ${String(b.event_date || "").trim().slice(0, 120)},
      deposit_pct = ${Number(b.deposit_pct) || 0},
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
                            issue_date, due_date, event_date, deposit_pct, notes, token)
      VALUES (${number}, ${"invoice"}, ${"draft"}, ${inv.customer_id}, ${inv.customer_name},
              ${inv.customer_email}, ${inv.customer_phone}, ${inv.customer_address}, ${inv.order_id},
              ${JSON.stringify(inv.items)}, ${inv.tax_rate}, ${inv.discount},
              ${new Date().toISOString().slice(0, 10)}, ${null}, ${inv.event_date || ""}, ${inv.deposit_pct || 0},
              ${inv.notes}, ${token})
      RETURNING id, number`;
    await sql`UPDATE invoices SET status = 'accepted' WHERE id = ${b.id}`;
    return NextResponse.json({ ok: true, ...rows[0] });
  }

  // convert an accepted invoice/quote → a firm order on the Orders page
  if (b.convertToOrder) {
    const [inv] = await sql`SELECT * FROM invoices WHERE id = ${b.id}`;
    if (!inv) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    if (inv.order_id) {
      return NextResponse.json({ error: `Already linked to order #${inv.order_id}.` }, { status: 400 });
    }

    const items = Array.isArray(inv.items) ? inv.items : [];
    const itemsDesc = items.map((it) => `${it.qty}× ${it.name ?? it.desc ?? ""}`.trim()).filter(Boolean).join(", ").slice(0, 500)
      || String(inv.notes || "").slice(0, 500) || "See invoice for details";
    const totals = invoiceTotals(inv);
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = toISODate(inv.due_date);
    const deliveryDate = dueDate || today;
    const hasAddress = String(inv.customer_address || "").trim().length > 0;
    const notes = [
      `Converted from ${inv.kind === "quote" ? "quotation" : "invoice"} ${inv.number}`,
      inv.event_date ? `Event date(s): ${inv.event_date}` : "",
    ].filter(Boolean).join(" · ");

    const rows = await sql`
      INSERT INTO orders (customer_id, customer_name, phone, email, order_type, items_desc,
                          delivery_date, delivery_time, address, payment_status, total, notes,
                          fulfillment_type, occasion, source)
      VALUES (${inv.customer_id}, ${inv.customer_name}, ${inv.customer_phone || ""}, ${inv.customer_email || ""},
              ${"retail"}, ${itemsDesc},
              ${deliveryDate}, ${""}, ${inv.customer_address || ""},
              ${inv.status === "paid" ? "paid" : "unpaid"}, ${totals.total},
              ${notes},
              ${hasAddress ? "delivery" : "pickup"}, ${""}, ${"invoice"})
      RETURNING id`;

    await sql`UPDATE invoices SET order_id = ${rows[0].id} WHERE id = ${b.id}`;
    return NextResponse.json({ ok: true, orderId: rows[0].id });
  }

  return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("invoice PATCH error", err);
    return NextResponse.json({ error: err.message || "Something went wrong. Please try again." }, { status: 500 });
  }
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
