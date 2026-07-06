import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Public endpoint — no login required. This powers the shareable customer order form.
export async function POST(request) {
  try {
    const b = await request.json();

    // honeypot: real customers never fill this hidden field
    if (b.website) return NextResponse.json({ ok: true });

    if (!b.customer_name || !b.delivery_date || !b.items_desc) {
      return NextResponse.json(
        { error: "Please fill in your name, what you'd like, and the date." },
        { status: 400 }
      );
    }
    if (!b.phone && !b.email) {
      return NextResponse.json(
        { error: "Please leave a phone number or email so we can reach you." },
        { status: 400 }
      );
    }
    const fulfillment = b.fulfillment_type === "pickup" ? "pickup" : "delivery";
    if (fulfillment === "delivery" && !b.address) {
      return NextResponse.json({ error: "Please provide a delivery address, or choose pickup." }, { status: 400 });
    }

    const sql = await db();
    const budget = b.budget ? `Budget: ${String(b.budget).trim()}` : "";
    const notes = [String(b.notes || "").trim(), budget].filter(Boolean).join(" · ");

    const rows = await sql`
      INSERT INTO orders (customer_name, phone, email, order_type, items_desc,
                          delivery_date, delivery_time, address, payment_status, total, notes,
                          fulfillment_type, occasion, source, status)
      VALUES (${String(b.customer_name).trim().slice(0, 120)},
              ${String(b.phone || "").trim().slice(0, 40)},
              ${String(b.email || "").trim().slice(0, 120)},
              ${"retail"},
              ${String(b.items_desc).trim().slice(0, 500)},
              ${b.delivery_date},
              ${String(b.delivery_time || "").slice(0, 20)},
              ${fulfillment === "delivery" ? String(b.address || "").trim().slice(0, 300) : ""},
              ${"unpaid"}, ${0},
              ${notes.slice(0, 500)},
              ${fulfillment},
              ${String(b.occasion || "").trim().slice(0, 60)},
              ${"webform"}, ${"pending"})
      RETURNING id`;
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error("public order error", err);
    return NextResponse.json({ error: "Something went wrong. Please try again or call us." }, { status: 500 });
  }
}
