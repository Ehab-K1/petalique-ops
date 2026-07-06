import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Public endpoint — no login required. This powers the shareable customer order form.
export async function POST(request) {
  try {
    const b = await request.json();

    // honeypot: real customers never fill this hidden field
    if (b.website) return NextResponse.json({ ok: true });

    const products = Array.isArray(b.products) ? b.products.map(String).filter(Boolean) : [];

    if (!b.customer_name || !b.delivery_date || products.length === 0) {
      return NextResponse.json(
        { error: "Please fill in your name, select at least one product, and the date." },
        { status: 400 }
      );
    }
    if (!String(b.quantity || "").trim()) {
      return NextResponse.json({ error: "Please tell us the quantity you need." }, { status: 400 });
    }
    if (!String(b.preferred_contact || "").trim()) {
      return NextResponse.json({ error: "Please let us know the best way to reach you." }, { status: 400 });
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

    const addonsList = Array.isArray(b.addons) ? b.addons.map(String).filter(Boolean) : [];
    if (b.addons_other) addonsList.push(`Other: ${String(b.addons_other).trim()}`);
    const addonsStr = addonsList.join(", ").slice(0, 400);
    const productTypesStr = products.join(", ").slice(0, 300);

    // items_desc keeps showing a clean summary in the existing admin order list
    const summary = [productTypesStr, `Qty: ${String(b.quantity).trim()}`].filter(Boolean).join(" · ");
    const detail = String(b.items_desc || "").trim();
    const itemsDesc = [summary, detail].filter(Boolean).join(" — ").slice(0, 500);

    const budget = b.budget ? `Budget: ${String(b.budget).trim()}` : "";
    const notes = [
      String(b.notes || "").trim(),
      addonsStr ? `Add-ons: ${addonsStr}` : "",
      budget,
      `Preferred contact: ${String(b.preferred_contact).trim()}`,
      b.marketing_optin ? "Opted in to marketing emails" : "",
    ].filter(Boolean).join(" · ").slice(0, 500);

    const rows = await sql`
      INSERT INTO orders (customer_name, phone, email, order_type, items_desc,
                          delivery_date, delivery_time, address, payment_status, total, notes,
                          fulfillment_type, occasion, source, status,
                          product_types, quantity, addons, preferred_contact, marketing_optin)
      VALUES (${String(b.customer_name).trim().slice(0, 120)},
              ${String(b.phone || "").trim().slice(0, 40)},
              ${String(b.email || "").trim().slice(0, 120)},
              ${"retail"},
              ${itemsDesc},
              ${b.delivery_date},
              ${String(b.delivery_time || "").slice(0, 20)},
              ${fulfillment === "delivery" ? String(b.address || "").trim().slice(0, 300) : ""},
              ${"unpaid"}, ${0},
              ${notes},
              ${fulfillment},
              ${String(b.occasion || "").trim().slice(0, 60)},
              ${"webform"}, ${"pending"},
              ${productTypesStr}, ${String(b.quantity).trim().slice(0, 60)},
              ${addonsStr}, ${String(b.preferred_contact).trim().slice(0, 60)},
              ${b.marketing_optin === true})
      RETURNING id`;
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error("public order error", err);
    return NextResponse.json({ error: "Something went wrong. Please try again or call us." }, { status: 500 });
  }
}
