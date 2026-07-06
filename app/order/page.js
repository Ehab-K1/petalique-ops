"use client";

import { useState } from "react";
import { BloomMark } from "@/components/ui";
import { Petals, Segmented } from "@/components/client";

const OCCASIONS = ["Birthday", "Anniversary", "Wedding", "Sympathy", "New baby", "Get well", "Just because", "Corporate event", "Other"];

const BLANK = {
  customer_name: "", phone: "", email: "", occasion: "",
  items_desc: "", budget: "",
  delivery_date: "", delivery_time: "",
  fulfillment_type: "delivery", address: "", notes: "",
  website: "", // honeypot
};

export default function PublicOrderPage() {
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
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
              Thank you, {form.customer_name.split(" ")[0]}. Our florists will reach out shortly to
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
              <label className="field">
                <span>What would you like? *</span>
                <textarea rows={3} value={form.items_desc}
                  onChange={(e) => setForm({ ...form, items_desc: e.target.value })}
                  placeholder="e.g. A romantic bouquet with red roses and eucalyptus, wrapped, around $80"
                  required />
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
