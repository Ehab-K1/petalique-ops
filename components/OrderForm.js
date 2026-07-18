"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Segmented, toast } from "./client";

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

export function blankOrder(presetCustomer) {
  return {
    customer_id: presetCustomer?.id || "",
    customer_name: presetCustomer?.name || "",
    phone: presetCustomer?.phone || "",
    email: presetCustomer?.email || "",
    order_type: "retail",
    items_desc: "",
    delivery_date: new Date().toISOString().slice(0, 10),
    delivery_time: "", address: "", payment_status: "unpaid", total: "", notes: "",
    fulfillment_type: "delivery", assigned_user_id: "", occasion: "",
  };
}

export function orderToForm(o) {
  return {
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
  };
}

/*
 * The one order form used everywhere — new order on the Orders page, edit on
 * the Orders page, and edit inside the order detail view. One source of truth.
 */
export default function OrderForm({ initial, editingId, customers = [], users = [], onDone }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(editingId);

  function pickCustomer(id) {
    const c = customers.find((x) => String(x.id) === String(id));
    if (c) {
      setForm({
        ...form, customer_id: c.id, customer_name: c.name,
        phone: c.phone || form.phone, email: c.email || form.email,
      });
    } else {
      setForm({ ...form, customer_id: "" });
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch("/api/orders", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { ...form, id: editingId, edit: true } : form),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(isEdit ? "Order updated" : "Order added");
      router.refresh();
      onDone?.(d);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not save.");
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Segmented
          options={[["delivery", "Delivery"], ["pickup", "Pickup"]]}
          value={form.fulfillment_type}
          onChange={(v) => setForm({ ...form, fulfillment_type: v })}
        />
      </div>
      {customers.length > 0 && (
        <label className="field">
          <span>Existing customer — orders link to their history automatically</span>
          <select value={form.customer_id} onChange={(e) => pickCustomer(e.target.value)}>
            <option value="">New or one-time customer (a record is created for them)</option>
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
        {!isEdit && (
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
        {saving ? "Saving..." : isEdit ? "Save changes" : "Add order"}
      </button>
    </form>
  );
}
