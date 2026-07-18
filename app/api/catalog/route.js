import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sql = await db();
  const items = await sql`SELECT * FROM catalog_items ORDER BY kind ASC, sort ASC, id ASC`;
  return NextResponse.json({ items });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = await request.json();
  if (!b.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const sql = await db();
  const kind = b.kind === "addon" ? "addon" : "product";
  const [{ m }] = await sql`SELECT COALESCE(MAX(sort), -1)::int AS m FROM catalog_items WHERE kind = ${kind}`;
  const rows = await sql`INSERT INTO catalog_items (kind, name, price_label, price, active, sort)
    VALUES (${kind}, ${String(b.name).trim().slice(0, 120)},
            ${String(b.price_label || "").trim().slice(0, 40)},
            ${b.price === "" || b.price == null ? null : Number(b.price)},
            ${b.active !== false}, ${m + 1})
    RETURNING id`;
  await logActivity(sql, user, "created", "catalog", rows[0].id,
    `added ${kind} “${String(b.name).trim()}” to catalog`);
  return NextResponse.json({ ok: true, id: rows[0].id });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  if (b.name !== undefined) {
    await sql`UPDATE catalog_items SET
      name = ${String(b.name).trim().slice(0, 120)},
      price_label = ${String(b.price_label || "").trim().slice(0, 40)},
      price = ${b.price === "" || b.price == null ? null : Number(b.price)}
      WHERE id = ${b.id}`;
  }
  if (b.active !== undefined) {
    await sql`UPDATE catalog_items SET active = ${b.active === true} WHERE id = ${b.id}`;
  }
  if (b.sort !== undefined) {
    await sql`UPDATE catalog_items SET sort = ${Number(b.sort) || 0} WHERE id = ${b.id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();
  const [it] = await sql`DELETE FROM catalog_items WHERE id = ${b.id} RETURNING name`;
  await logActivity(sql, user, "deleted", "catalog", parseInt(b.id, 10),
    `removed “${it?.name || b.id}” from catalog`);
  return NextResponse.json({ ok: true });
}
