"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, money } from "./ui";
import { Modal, Segmented, CopyButton, toast } from "./client";

const DELIVERY_STATUSES = [
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["prepping", "Prepping"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled"],
];

const PICKUP_STATUSES = [
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["prepping", "Prepping"],
  ["ready_for_pickup", "Ready for pickup"],
  ["picked_up", "Picked up"],
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

const OCCASIONS = ["", "Birthday", "Anniversary", "Wedding", "Sympathy", "New baby", "Get well", "Just because", "Corporate event", "Other"];

const BLANK = {
  customer_id: "", customer_name: "", phone: "", email: "", order_type: "retail",
  items_desc: "", delivery_date: new Date().toISOString().slice(0, 10),
  delivery_time: "", address: "", payment_status: "unpaid", total: "", notes: "",
  fulfillment_type: "delivery", assigned_user_id: "", occasion: "",
};

export default function OrdersClient({ orders, customers, users }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // order object being edited
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState("open"); // open | all | webform
  const [fulfilFilter, setFulfilFilter] = useState("all");

  const today = new Date().toISOString().slice(0, 10);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const shareUrl = `${origin}/order`;

  async function api(method, body, msg) {
    const res = await fetch("/api/orders", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.refresh();
      if (msg) toast(msg);
    }
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

  async function submitOrder(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const isEdit = Boolean(editing);
    const res = await api(
      isEdit ? "PATCH" : "POST",
      isEdit ? { ...form, id: editing.id, edit: true } : form,
      isEdit ? "Order updated" : "Order added"
    );
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setEditing(null);
      setForm(BLANK);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not save.");
    }
  }

  function startEdit(o) {
    setForm({
      customer_id: o.customer_id || "",
      customer_name: o.customer_name || "",
      phone: o.phone || "",
      email: o.email || "",
      order_type: o.order_type || "retail",
      items_desc: o.items_desc || "",
      delivery_date: String(o.delivery_date).slice(0, 10),
      delivery_time: o.delivery_time || "",
      address: o.address || "",
      payment_status: o.payment_status || "unpaid",
      total: o.total ?? "",
      notes: o.notes || "",
      fulfillment_type: o.fulfillment_type || "delivery",
      assigned_user_id: o.assigned_user_id || "",
      occasion: o.occasion || "",
    });
    setEditing(o);
    setError("");
  }

  const filtered = useMemo(() => {
    let list = orders;
    if (view === "open") list = list.filter((o) => !["delivered", "picked_up", "cancelled"].includes(o.status));
    if (view === "webform") list = list.filter((o) => o.source === "webform");
    if (fulfilFilter !== "all") list = list.filter((o) => (o.fulfillment_type || "delivery") === fulfilFilter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((o) =>
        [o.customer_name, o.phone, o.items_desc, o.address, o.notes, o.occasion, o.assigned_name]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
      );
    }
    return list;
  }, [orders, q, view, fulfilFilter]);

  const formBody = (
    <form className="stack" onSubmit={submitOrder}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Segmented
          options={[["delivery", "🚗 Delivery"], ["pickup", "🏪 Pickup"]]}
          value={form.fulfillment_type}
          onChange={(v) => setForm({ ...form, fulfillment_type: v })}
        />
      </div>
      {customers.length > 0 && !editing && (
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
          <span>Occasion, optional</span>
          <select value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })}>
            {OCCASIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
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
          <span>{form.fulfillment_type === "pickup" ? "Pickup date" : "Delivery date"}</span>
          <input type="date" value={form.delivery_date}
            onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} required />
        </label>
        <label className="field">
          <span>Time, optional</span>
          <input type="time" value={form.delivery_time}
            onChange={(e) => setForm({ ...form, delivery_time: e.target.value })} />
        </label>
      </div>
      {form.fulfillment_type === "delivery" && (
        <label className="field">
          <span>Delivery address</span>
          <input value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
      )}
      <div className="form-grid-2">
        <label className="field">
          <span>Total price, optional</span>
          <input type="number" step="0.01" min="0" value={form.total}
            onChange={(e) => setForm({ ...form, total: e.target.value })} placeholder="79.00" />
        </label>
        <label className="field">
          <span>Sold by</span>
          <select value={form.assigned_user_id}
            onChange={(e) => setForm({ ...form, assigned_user_id: e.target.value })}>
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      </div>
      <div className="form-grid-2">
        {!editing && (
          <label className="field">
            <span>Payment status</span>
            <select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })}>
              {PAYMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Notes, optional</span>
          <input value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Ring doorbell, leave with concierge" />
        </label>
      </div>
      {error && <div className="error-text">{error}</div>}
      <button className="btn" type="submit" disabled={saving}>
        {saving ? "Saving..." : editing ? "Save changes" : "Add order"}
      </button>
    </form>
  );

  return (
    <>
      <div className="share-box" style={{ marginBottom: 14 }}>
        <span>🌸</span>
        <code>{shareUrl}</code>
        <CopyButton text={shareUrl} label="Copy order form link" small />
      </div>

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input placeholder="Search orders…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented
          options={[["open", "Open"], ["all", "All"], ["webform", "Web form"]]}
          value={view} onChange={setView}
        />
        <select className="inline-select" value={fulfilFilter} onChange={(e) => setFulfilFilter(e.target.value)}>
          <option value="all">Delivery + pickup</option>
          <option value="delivery">Delivery only</option>
          <option value="pickup">Pickup only</option>
        </select>
      </div>

      <button className="btn btn-block" onClick={() => { setShowForm(!showForm); setEditing(null); setForm(BLANK); }} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ New order"}
      </button>

      {showForm && !editing && (
        <div className="card" style={{ marginBottom: 14 }}>{formBody}</div>
      )}

      {editing && (
        <Modal title={`Edit order — ${editing.customer_name}`} onClose={() => { setEditing(null); setForm(BLANK); }}>
          {formBody}
        </Modal>
      )}

      {filtered.length === 0 && !showForm && (
        <div className="empty">No orders match. Adjust the filters or add a new one.</div>
      )}

      <div className="stack stagger">
        {filtered.map((o) => {
          const d = String(o.delivery_date).slice(0, 10);
          const done = ["delivered", "picked_up", "cancelled"].includes(o.status);
          const isOverdue = d < today && !done;
          const isPickup = (o.fulfillment_type || "delivery") === "pickup";
          const statuses = isPickup ? PICKUP_STATUSES : DELIVERY_STATUSES;
          return (
            <div className="card" key={o.id} style={done ? { opacity: 0.65 } : undefined}>
              <div className="row" style={{ borderBottom: "none", padding: 0 }}>
                <div className="row-main">
                  <div className="row-title">
                    {o.customer_name}
                    {Number(o.total) > 0 && <span className="muted"> · {money(o.total)}</span>}
                    {o.source === "webform" && <span className="pill pill-gold" style={{ marginLeft: 6 }}>Web form</span>}
                  </div>
                  <div className="row-sub">
                    {fmtDate(o.delivery_date)}
                    {o.delivery_time ? ` at ${o.delivery_time}` : ""}
                    {o.phone ? ` · ${o.phone}` : ""}
                    {o.occasion ? ` · ${o.occasion}` : ""}
                    {o.assigned_name ? ` · sold by ${o.assigned_name}` : ""}
                  </div>
                  {!isPickup && o.address && <div className="row-sub">📍 {o.address}</div>}
                  {o.items_desc && <div className="row-sub" style={{ color: "var(--ink)" }}>{o.items_desc}</div>}
                  {o.notes && <div className="row-sub">Note: {o.notes}</div>}
                </div>
                <div className="row-side">
                  <span className={"pill " + (isPickup ? "pill-green" : "pill-wine")}>
                    {isPickup ? "🏪 Pickup" : "🚗 Delivery"}
                  </span>
                  {isOverdue && <span className="pill pill-rust pill-pulse">Overdue</span>}
                  {d === today && !done && <span className="pill pill-amber">Today</span>}
                </div>
              </div>

              <div className="row-side" style={{ marginTop: 10, justifyContent: "flex-start" }}>
                <select
                  className="inline-select"
                  value={o.status}
                  onChange={(e) => api("PATCH", { id: o.id, status: e.target.value }, "Status updated")}
                >
                  {statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select
                  className="inline-select"
                  value={o.payment_status}
                  onChange={(e) => api("PATCH", { id: o.id, payment_status: e.target.value }, "Payment status updated")}
                >
                  {PAYMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select
                  className="inline-select"
                  value={o.assigned_user_id || ""}
                  onChange={(e) => api("PATCH", { id: o.id, assigned_user_id: e.target.value || null }, "Assignment updated")}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(o)}>Edit</button>
                {confirmId === o.id ? (
                  <>
                    <span className="error-text">Delete?</span>
                    <button className="btn btn-sm" style={{ background: "#a8462b" }}
                      onClick={() => { api("DELETE", { id: o.id }, "Order deleted"); setConfirmId(null); }}>
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
