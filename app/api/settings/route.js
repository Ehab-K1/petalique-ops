import { NextResponse } from "next/server";
import { db, getBusiness, DEFAULT_BUSINESS } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const business = await getBusiness();
  return NextResponse.json({ business });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = await request.json();
  const sql = await db();

  if (b.business) {
    const clean = {};
    for (const key of Object.keys(DEFAULT_BUSINESS)) {
      if (b.business[key] !== undefined) {
        clean[key] = key === "tax_rate" || key === "deposit_pct"
          ? Number(b.business[key]) || 0
          : String(b.business[key]).slice(0, 300);
      }
    }
    const current = await getBusiness(sql);
    const next = { ...current, ...clean };
    await sql`INSERT INTO settings (key, value, updated_at) VALUES ('business', ${JSON.stringify(next)}, now())
      ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(next)}, updated_at = now()`;
    await logActivity(sql, user, "updated", "settings", null, "updated business settings");
    return NextResponse.json({ ok: true, business: next });
  }
  return NextResponse.json({ ok: true });
}
