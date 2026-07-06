"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, money } from "./ui";

const STATUSES = [
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["prepping", "Prepping"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled"],
];

const TYPES = [
  ["retail", "Retail"],
  ["event", "Event rental"],
  ["wholesale", "Wholesale"],
];

const PAYMENTS = [
  ["unpaid", "Unpaid"],
  ["deposit", "Deposit"],
  ["paid", "Paid"],
];

const BLANK = {
  customer_id: "", customer_name: "", phone: "", order_type: "retail",
  items_desc: "", delivery_date: new Date().toISOString().slice(0, 10),
  delivery_time: "", address: "", payment_status: "unpaid", total: "", notes: "",
};

export default function OrdersClient({ orders, customers }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function api(method, body) {
    const res = await fetch("/api/orders", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) router.refresh();
    return res;
  }

  function pickCustomer(id) {
    const c = customers.find((x) => String(x.id) === String(id));
    if (c) {
      setForm({ ...form, customer_id: c.id, customer_name: c.name, phone: c.phone || form.phone });
    } else {
      setForm({ ...form, customer_id: "" });
    }
  }

  async function addOrder(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await api("POST", form);
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setForm(BLANK);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not save.");
    }
  }

  return (
    <>
      <button className="btn btn-block" onClick={() => setShowForm(!showForm)} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ New order"}
      </button>

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <form className="stack" onSubmit={addOrder}>
            {customers.length > 0 && (
              <label className="field">
                <span>Existing customer, optional</span>
                <select value={form.customer_id} onChange={(e) => pickCustomer(e.target.value)}>
                  <option value="">New or one-time customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.type !== "retail" ? ` (${c.type})` : ""}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="form-grid-2">
              <label className="field">
                <span>Customer name</span>
                <input value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required />
              </label>
              <label className="field">
                <span>Phone, optional</span>
                <input value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
            </div>
            <div className="form-grid-2">
              <label className="field">
                <span>Order type</span>
                <select value={form.order_type} onChange={(e) => setForm({ ...form, order_type: e.target.value })}>
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Total price, optional</span>
                <input type="number" step="0.01" min="0" value={form.total}
                  onChange={(e) => setForm({ ...form, total: e.target.value })} placeholder="79.00" />
              </label>
            </div>
            <label className="field">
              <span>What is in the order</span>
              <input value={form.items_desc}
                onChange={(e) => setForm({ ...form, items_desc: e.target.value })}
                placeholder="e.g. 2 dozen red roses, medium vase" />
            </label>
            <div className="form-grid-2">
              <label className="field">
                <span>Delivery date</span>
                <input type="date" value={form.delivery_date}
                  onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} required />
              </label>
              <label className="field">
                <span>Time, optional</span>
                <input type="time" value={form.delivery_time}
                  onChange={(e) => setForm({ ...form, delivery_time: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Delivery address, optional</span>
              <input value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <div className="form-grid-2">
              <label className="field">
                <span>Payment status</span>
                <select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })}>
                  {PAYMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Notes, optional</span>
                <input value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Ring doorbell, leave with concierge" />
              </label>
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add order"}
            </button>
          </form>
        </div>
      )}

      {orders.length === 0 && !showForm && (
        <div className="empty">No orders yet. Add the first one and retire the spreadsheet.</div>
      )}

      <div className="stack">
        {orders.map((o) => {
          const d = String(o.delivery_date).slice(0, 10);
          const done = o.status === "delivered" || o.status === "cancelled";
          const isOverdue = d < today && !done;
          return (
            <div className="card" key={o.id} style={done ? { opacity: 0.65 } : undefined}>
              <div className="row" style={{ borderBottom: "none", padding: 0 }}>
                <div className="row-main">
                  <div className="row-title">
                    {o.customer_name}
                    {Number(o.total) > 0 && <span className="muted"> · {money(o.total)}</span>}
                  </div>
                  <div className="row-sub">
                    {fmtDate(o.delivery_date)}
                    {o.delivery_time ? ` at ${o.delivery_time}` : ""}
                    {o.phone ? ` · ${o.phone}` : ""}
                  </div>
                  {o.address && <div className="row-sub">{o.address}</div>}
                  {o.items_desc && <div className="row-sub" style={{ color: "var(--ink)" }}>{o.items_desc}</div>}
                  {o.notes && <div className="row-sub">Note: {o.notes}</div>}
                </div>
                <div className="row-side">
                  <span className="pill pill-wine">{(TYPES.find(([v]) => v === o.order_type) || [])[1] || o.order_type}</span>
                  {isOverdue && <span className="pill pill-rust">Overdue</span>}
                  {d === today && !done && <span className="pill pill-amber">Today</span>}
                </div>
              </div>

              <div className="row-side" style={{ marginTop: 10, justifyContent: "flex-start" }}>
                <select
                  className="inline-select"
                  value={o.status}
                  onChange={(e) => api("PATCH", { id: o.id, status: e.target.value })}
                >
                  {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select
                  className="inline-select"
                  value={o.payment_status}
                  onChange={(e) => api("PATCH", { id: o.id, payment_status: e.target.value })}
                >
                  {PAYMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {confirmId === o.id ? (
                  <>
                    <span className="error-text">Delete?</span>
                    <button className="btn btn-sm" style={{ background: "#a8462b" }}
                      onClick={() => { api("DELETE", { id: o.id }); setConfirmId(null); }}>
                      Yes
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>No</button>
                  </>
                ) : (
                  <button className="btn-danger btn" onClick={() => setConfirmId(o.id)}>Delete</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
