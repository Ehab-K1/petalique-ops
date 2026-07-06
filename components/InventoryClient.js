"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FreshMeter, fmtDate, money } from "./ui";

const VARIETIES = [
  "Rose - Red", "Rose - White", "Rose - Pink", "Calla Lily", "Lily - Oriental",
  "Eucalyptus", "Gerbera", "Snapdragon", "Stock", "Ranunculus", "Peony", "Hydrangea",
];

export default function InventoryClient({ batches, openOrders }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState({
    variety: "", quantity: "", unit_cost: "",
    intake_date: new Date().toISOString().slice(0, 10), source: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function api(method, body) {
    const res = await fetch("/api/inventory", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) router.refresh();
    return res;
  }

  async function addBatch(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await api("POST", form);
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setForm({ ...form, variety: "", quantity: "", unit_cost: "", source: "" });
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not save.");
    }
  }

  return (
    <>
      <button className="btn btn-block" onClick={() => setShowForm(!showForm)} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ Log new stem intake"}
      </button>

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <form className="stack" onSubmit={addBatch}>
            <label className="field">
              <span>Variety</span>
              <input
                list="pf-varieties"
                value={form.variety}
                onChange={(e) => setForm({ ...form, variety: e.target.value })}
                placeholder="e.g. Calla Lily"
                required
              />
              <datalist id="pf-varieties">
                {VARIETIES.map((v) => <option key={v} value={v} />)}
              </datalist>
            </label>
            <div className="form-grid-2">
              <label className="field">
                <span>Quantity (stems)</span>
                <input type="number" min="1" value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
              </label>
              <label className="field">
                <span>Cost per stem, optional</span>
                <input type="number" step="0.01" min="0" value={form.unit_cost}
                  onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} placeholder="1.20" />
              </label>
            </div>
            <div className="form-grid-2">
              <label className="field">
                <span>Intake date</span>
                <input type="date" value={form.intake_date}
                  onChange={(e) => setForm({ ...form, intake_date: e.target.value })} required />
              </label>
              <label className="field">
                <span>Source, optional</span>
                <input value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  placeholder="Impacts Florals" />
              </label>
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add to inventory"}
            </button>
          </form>
        </div>
      )}

      {batches.length === 0 && !showForm && (
        <div className="empty">
          No inventory yet. Log what comes in each week so you can see what is left before ordering more.
        </div>
      )}

      <div className="stack">
        {batches.map((item) => {
          const active = item.status === "available" || item.status === "reserved";
          const assigned = openOrders.find((o) => o.id === item.assigned_order_id);
          return (
            <div className="card" key={item.id}>
              <div className="row" style={{ borderBottom: "none", padding: 0 }}>
                <div className="row-main">
                  <div className="row-title">{item.variety}</div>
                  <div className="row-sub">
                    In {fmtDate(item.intake_date)}
                    {item.source ? ` · ${item.source}` : ""}
                    {item.unit_cost != null ? ` · ${money(item.unit_cost)}/stem` : ""}
                  </div>
                </div>
                <div className="row-side">
                  {active ? (
                    <FreshMeter intakeDate={item.intake_date} />
                  ) : (
                    <span className="pill pill-gray">{item.status === "used" ? "Used up" : "Waste"}</span>
                  )}
                </div>
              </div>

              <div className="row-side" style={{ marginTop: 10, justifyContent: "flex-start" }}>
                <span className="muted">Qty</span>
                <input
                  type="number"
                  min="0"
                  defaultValue={item.quantity}
                  style={{ width: 80, padding: "4px 8px", fontSize: 13 }}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v) && v !== item.quantity) api("PATCH", { id: item.id, quantity: v });
                  }}
                  disabled={!active}
                />
                {active && (
                  <>
                    <select
                      className="inline-select"
                      value={item.assigned_order_id || ""}
                      onChange={(e) => api("PATCH", { id: item.id, assigned_order_id: e.target.value || null })}
                    >
                      <option value="">Available</option>
                      {openOrders.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.customer_name} · {fmtDate(o.delivery_date)}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={() => api("PATCH", { id: item.id, status: "used" })}>
                      Mark used
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => api("PATCH", { id: item.id, status: "waste" })}>
                      Waste
                    </button>
                  </>
                )}
                {assigned && active && (
                  <span className="pill pill-wine">→ {assigned.customer_name}</span>
                )}
                {confirmId === item.id ? (
                  <>
                    <span className="error-text">Delete?</span>
                    <button className="btn btn-sm" style={{ background: "#a8462b" }}
                      onClick={() => { api("DELETE", { id: item.id }); setConfirmId(null); }}>
                      Yes
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>No</button>
                  </>
                ) : (
                  <button className="btn-danger btn" onClick={() => setConfirmId(item.id)}>Delete</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
