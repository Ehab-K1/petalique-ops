"use client";

import { useState } from "react";
import { BloomMark } from "@/components/ui";
import { Petals, Segmented } from "@/components/client";

const OCCASIONS = ["Birthday", "Anniversary", "Wedding", "Sympathy", "New baby", "Get well", "Just because", "Corporate event", "Other"];

const PRODUCTS = [
  "Bloom Bar",
  "Flower Canopy / Phoolon Ki Chaadar",
  "Bouquet",
  "Gajra / Corsage",
  "Garland / Mala",
  "Boutonniere",
  "Hair Piece",
  "Bridal Flower Jewelry",
  "Gift Basket",
  "Table Arrangements",
  "Rose Petal Bags",
  "Wholesale",
];

const ADDONS = [
  ["Baby Breath Bunches", ""],
  ["Tissue", ""],
  ["Jewels on Flowers", "+$5–$30"],
  ["Hand Written Card", "+$5"],
  ["Initial", "+$15"],
  ["Butterfly", "+$2/each"],
  ["Crown", "+$5"],
  ["Tiara", "+$10"],
  ["Baby Breath Rim", "+$10"],
  ["“Just For You” Ribbon", "+$2"],
  ["Bow Topper", "+$5"],
  ["Bow + Custom Banner", "+$20"],
  ["Pearl Bow", "+$5"],
  ["Glitter", "+$1/stem"],
  ["Green Floral Foam", "+$5"],
];

const CONTACT_METHODS = ["Phone call", "Text message", "Email", "WhatsApp"];

const BLANK = {
  customer_name: "", phone: "", email: "", occasion: "",
  products: [], quantity: "", addons: [], addons_other: "",
  items_desc: "", budget: "",
  delivery_date: "", delivery_time: "",
  fulfillment_type: "delivery", address: "", notes: "",
  preferred_contact: "", marketing_optin: false,
  website: "", // honeypot
};

export default function PublicOrderPage() {
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  function toggle(field, value) {
    setForm((f) => {
      const has = f[field].includes(value);
      return { ...f, [field]: has ? f[field].filter((v) => v !== value) : [...f[field], value] };
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (form.products.length === 0) {
      setError("Please select at least one product.");
      return;
    }
    if (!form.quantity.trim()) {
      setError("Please tell us the quantity you need.");
      return;
    }
    if (!form.preferred_contact) {
      setError("Please let us know the best way to reach you.");
      return;
    }
    setSending(true);
    const res = await fetch("/api/public/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSending(false);
    if (res.ok) {
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Something went wrong. Please try again.");
    }
  }

  const minDate = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ position: "relative", overflow: "hidden", minHeight: "100vh" }}>
      <Petals />
      <div className="public-wrap" style={{ position: "relative", zIndex: 1 }}>
        <div className="public-hero">
          <div className="mark"><BloomMark size={52} /></div>
          <h1>Petalique Flora</h1>
          <p>Tell us what you&apos;re dreaming of — we&apos;ll confirm availability and pricing within the day.</p>
        </div>

        {done ? (
          <div className="card success-bloom">
            <div className="ring">
              <BloomMark size={40} />
            </div>
            <h2>Request received!</h2>
            <p>
              Thank you, {form.customer_name.split(" ")[0]}. Our florists will reach out via{" "}
              {form.preferred_contact ? form.preferred_contact.toLowerCase() : "phone or email"} shortly to
              confirm the details{form.fulfillment_type === "pickup" ? " and your pickup time" : " and delivery"}.
            </p>
            <button className="btn" style={{ marginTop: 18 }} onClick={() => { setForm(BLANK); setDone(false); }}>
              Place another request
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: 22 }}>
            <form className="stack" onSubmit={submit}>
              <div className="form-grid-2">
                <label className="field">
                  <span>Your name *</span>
                  <input value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required />
                </label>
                <label className="field">
                  <span>Occasion</span>
                  <select value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })}>
                    <option value="">Choose…</option>
                    {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-grid-2">
                <label className="field">
                  <span>Phone</span>
                  <input type="tel" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="We'll text to confirm" />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </label>
              </div>

              <div className="form-section">🌷 What would you like? *</div>
              <div className="chip-group">
                {PRODUCTS.map((p) => (
                  <label key={p} className={"chip" + (form.products.includes(p) ? " on" : "")}>
                    <input type="checkbox" checked={form.products.includes(p)}
                      onChange={() => toggle("products", p)} />
                    {p}
                  </label>
                ))}
              </div>
              <label className="field">
                <span>Quantity of selected product(s) *</span>
                <input value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="e.g. 2 bouquets, 1 gift basket" required />
              </label>
              <label className="field">
                <span>Describe your vision, optional</span>
                <textarea rows={2} value={form.items_desc}
                  onChange={(e) => setForm({ ...form, items_desc: e.target.value })}
                  placeholder="Colours, flower types, style inspiration…" />
              </label>

              <div className="form-section">✨ Customization add-ons, optional</div>
              <div className="chip-group">
                {ADDONS.map(([name, price]) => (
                  <label key={name} className={"chip" + (form.addons.includes(name) ? " on" : "")}>
                    <input type="checkbox" checked={form.addons.includes(name)}
                      onChange={() => toggle("addons", name)} />
                    {name}{price ? ` (${price})` : ""}
                  </label>
                ))}
              </div>
              <label className="field">
                <span>Other add-on, optional</span>
                <input value={form.addons_other}
                  onChange={(e) => setForm({ ...form, addons_other: e.target.value })}
                  placeholder="Something else in mind?" />
              </label>

              <div className="form-grid-2">
                <label className="field">
                  <span>Budget, optional</span>
                  <input value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="$60–100" />
                </label>
                <label className="field">
                  <span>When do you need it? *</span>
                  <input type="date" min={minDate} value={form.delivery_date}
                    onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} required />
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
                <Segmented
                  options={[["delivery", "🚗 Deliver it"], ["pickup", "🏪 I'll pick up"]]}
                  value={form.fulfillment_type}
                  onChange={(v) => setForm({ ...form, fulfillment_type: v })}
                />
              </div>

              {form.fulfillment_type === "delivery" ? (
                <label className="field">
                  <span>Delivery address *</span>
                  <input value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })} required />
                </label>
              ) : (
                <p className="muted" style={{ textAlign: "center" }}>
                  We&apos;ll confirm the pickup time and studio address with you directly. 💐
                </p>
              )}

              <div className="form-grid-2">
                <label className="field">
                  <span>Preferred time, optional</span>
                  <input type="time" value={form.delivery_time}
                    onChange={(e) => setForm({ ...form, delivery_time: e.target.value })} />
                </label>
                <label className="field">
                  <span>Anything else?</span>
                  <input value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Card message, colours to avoid…" />
                </label>
              </div>

              <div className="form-section">📞 How should we reach you?</div>
              <label className="field">
                <span>Best way to contact you *</span>
                <select value={form.preferred_contact}
                  onChange={(e) => setForm({ ...form, preferred_contact: e.target.value })} required>
                  <option value="">Choose…</option>
                  {CONTACT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>

              <label className="check-row">
                <input type="checkbox" checked={form.marketing_optin}
                  onChange={(e) => setForm({ ...form, marketing_optin: e.target.checked })} />
                <span>
                  🌷 Yes! I want updates, offers, and news from Petalique Flora — exclusive seasonal
                  deals, new bouquet launches, and pre-order opportunities. Unsubscribe anytime.
                </span>
              </label>

              {/* honeypot — hidden from humans */}
              <input
                type="text" value={form.website} tabIndex={-1} autoComplete="off"
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }}
                aria-hidden="true"
              />

              {error && <div className="error-text">{error}</div>}
              <button className="btn btn-block" type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send my request 🌸"}
              </button>
              <p className="muted" style={{ textAlign: "center", fontSize: 12 }}>
                No payment now — we confirm price and availability first.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
