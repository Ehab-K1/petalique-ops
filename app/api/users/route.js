import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const b = await request.json();
  if (!b.email || !b.name || !b.password) {
    return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
  }
  if (String(b.password).length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  const sql = await db();
  const email = String(b.email).toLowerCase().trim();
  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }
  const hash = await bcrypt.hash(String(b.password), 10);
  await sql`INSERT INTO users (email, name, role, password_hash)
    VALUES (${email}, ${String(b.name).trim()}, ${b.role === "admin" ? "admin" : "staff"}, ${hash})`;
  return NextResponse.json({ ok: true });
}

export async function PATCH(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const sql = await db();

  if (b.role !== undefined) {
    if (Number(b.id) === Number(admin.id)) {
      return NextResponse.json({ error: "You can't change your own role." }, { status: 400 });
    }
    await sql`UPDATE users SET role = ${b.role === "admin" ? "admin" : "staff"} WHERE id = ${b.id}`;
  }
  if (b.password) {
    if (String(b.password).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    const hash = await bcrypt.hash(String(b.password), 10);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${b.id}`;
  }
  if (b.name) {
    await sql`UPDATE users SET name = ${String(b.name).trim()} WHERE id = ${b.id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const b = await request.json();
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  if (Number(b.id) === Number(admin.id)) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }
  const sql = await db();
  await sql`UPDATE orders SET assigned_user_id = NULL WHERE assigned_user_id = ${b.id}`;
  await sql`DELETE FROM users WHERE id = ${b.id}`;
  return NextResponse.json({ ok: true });
}
