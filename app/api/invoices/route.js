import { NextResponse } from "next/server";
import crypto from "crypto";
import { db, invoiceTotals } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { findOrCreateCustomer, syncOrderPayment } from "@/lib/sync";

// DATE columns read from raw Postgres rows arrive as JS Date objects, and
// String(dateObject).slice(0,10) silently produces garbage. Normalize first.
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
// Older invoices saved as {desc, qty, price} still render fine.
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

async function nextNumber(sql, kind) {
  const year = new Date().getFullYear();
  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM invoices WHERE kind = ${kind}`;
  return `${kind === "quote" ? "QUO" : "INV"}-${year}-${String(c + 1).padStart(3, "0")}`;
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  const sql = await db();

  try {

  // One-click "create invoice from order" — pre-filled and linked both ways.
  if (b.fromOrder) {
    const [o] = await sql`SELECT * FROM orders WHERE id = ${parseInt(b.fromOrder, 10)} AND deleted_at IS NULL`;
    if (!o) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const kind = b.kind === "quote" ? "quote" : "invoice";
    const number = await nextNumber(sql, kind);
    const token = crypto.randomBytes(16).toString("hex");
    const itemName = (o.product_types || o.items_desc || "Floral arrangement").slice(0, 160);
    const items = [{ section: "", name: itemName, detail: o.items_desc !== itemName ? String(o.items_desc || "").slice(0, 400) : "", qty: 1, price: Number(o.total) || 0 }];
    const rows = await sql`
      INSERT INTO invoices (number, kind, status, customer_id, customer_name, customer_email,
                            customer_phone, customer_address, order_id, items, tax_rate, discount,
                            issue_date, due_date, event_date, deposit_pct, notes, token)
      VALUES (${number}, ${kind}, ${"draft"}, ${o.customer_id}, ${o.customer_name},
              ${o.email || ""}, ${o.phone || ""}, ${o.address || ""}, ${o.id},
              ${JSON.stringify(items)}, ${0}, ${0},
              ${new Date().toISOString().slice(0, 10)}, ${toISODate(o.delivery_date) || null},
              ${""}, ${0}, ${""}, ${token})
      RETURNING id, number, token`;
    await logActivity(sql, user, "created", "invoice", rows[0].id,
      `created ${number} from order #${o.id} (${o.customer_name})`, { order_id: o.id });
    return NextResponse.json({ ok: true, ...rows[0] });
  }

  if (!b.customer_name) {
    return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
  }
  const items = cleanItems(b.items);
  if (items.length === 0) {
    return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
  }
  const kind = b.kind === "quote" ? "quote" : "invoice";
  const number = await nextNumber(sql, kind);
  const token = crypto.randomBytes(16).toString("hex");

  let customerId = b.customer_id ? parseInt(b.customer_id, 10) : null;
  if (!customerId) {
    customerId = await findOrCreateCustomer(sql, {
      name: b.customer_name, phone: b.customer_phone, email: b.customer_email,
    });
  }

  const rows = await sql`
    INSERT INTO invoices (number, kind, status, customer_id, customer_name, customer_email,
                          customer_phone, customer_address, order_id, items, tax_rate, discount,
                          issue_date, due_date, event_date, deposit_pct, notes, token)
    VALUES (${number}, ${kind}, ${"draft"},
            ${customerId},
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
  await logActivity(sql, user, "created", "invoice", rows[0].id,
    `created ${number} for ${String(b.customer_name).trim()}`);
  return NextResponse.json({ ok: true, ...rows[0] });

  } catch (err) {
    console.error("invoice POST error", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();

  try {

  if (b.restore) {
    const [inv] = await sql`UPDATE invoices SET deleted_at = NULL WHERE id = ${b.id} RETURNING number, order_id`;
    if (inv?.order_id) await syncOrderPayment(sql, inv.order_id);
    await logActivity(sql, user, "restored", "invoice", parseInt(b.id, 10), `restored ${inv?.number || `invoice #${b.id}`}`);
    return NextResponse.json({ ok: true });
  }

  if (b.status !== undefined) {
    const [inv] = await sql`SELECT number, status, order_id, kind FROM invoices WHERE id = ${b.id}`;
    await sql`UPDATE invoices SET status = ${b.status} WHERE id = ${b.id}`;
    // Marking an invoice paid by hand also settles its linked order.
    if (b.status === "paid" && inv?.order_id) {
      await sql`UPDATE orders SET payment_status = 'paid' WHERE id = ${inv.order_id}`;
    }
    if (inv && inv.status !== b.status) {
      await logActivity(sql, user, "status", "invoice", parseInt(b.id, 10),
        `marked ${inv.number} as ${b.status}`);
    }
  }

  if (b.edit) {
    const items = cleanItems(b.items);
    if (!b.customer_name || items.length === 0) {
      return NextResponse.json({ error: "Customer name and at least one item are required." }, { status: 400 });
    }
    let customerId = b.customer_id ? parseInt(b.customer_id, 10) : null;
    if (!customerId) {
      customerId = await findOrCreateCustomer(sql, {
        name: b.customer_name, phone: b.customer_phone, email: b.customer_email,
      });
    }
    await sql`UPDATE invoices SET
      customer_id = ${customerId},
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
    await logActivity(sql, user, "updated", "invoice", parseInt(b.id, 10),
      `updated invoice #${b.id} — ${String(b.customer_name).trim()}`);
  }

  // convert quote → invoice
  if (b.convert) {
    const [inv] = await sql`SELECT * FROM invoices WHERE id = ${b.id} AND kind = 'quote'`;
    if (!inv) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    const number = await nextNumber(sql, "invoice");
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
    await logActivity(sql, user, "converted", "invoice", rows[0].id,
      `converted ${inv.number} into ${number}`);
    return NextResponse.json({ ok: true, ...rows[0] });
  }

  // convert an invoice/quote → a firm order on the Orders page
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
    await syncOrderPayment(sql, rows[0].id);
    await logActivity(sql, user, "converted", "order", rows[0].id,
      `created order #${rows[0].id} from ${inv.number}`, { invoice_id: inv.id });
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
  const [inv] = await sql`UPDATE invoices SET deleted_at = now() WHERE id = ${b.id} RETURNING number, order_id`;
  if (inv?.order_id) await syncOrderPayment(sql, inv.order_id);
  await logActivity(sql, user, "deleted", "invoice", parseInt(b.id, 10),
    `moved ${inv?.number || `invoice #${b.id}`} to trash`);
  return NextResponse.json({ ok: true, undoable: true });
}
