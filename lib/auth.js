import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export const SESSION_COOKIE = "pf_session";
const secret = () => process.env.SESSION_SECRET || "dev-secret-change-me";

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function makeSessionValue(userId, days = 30) {
  const exp = Date.now() + days * 86400000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionValue(value) {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const payload = `${userId}.${exp}`;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  if (Number(exp) < Date.now()) return null;
  const id = Number(userId);
  return Number.isFinite(id) ? id : null;
}

export async function getSessionUser() {
  const store = await cookies();
  const userId = parseSessionValue(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const sql = await db();
  const rows = await sql`SELECT id, email, name, role FROM users WHERE id = ${userId}`;
  return rows[0] || null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
