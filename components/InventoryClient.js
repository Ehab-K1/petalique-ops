"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FreshMeter, fmtDate, money } from "./ui";
import { Modal, toast } from "./client";

const VARIETIES = [
  "Rose - Red", "Rose - White", "Rose - Pink", "Calla Lily", "Lily - Oriental",
  "Eucalyptus", "Gerbera", "Snapdragon", "Stock", "Ranunculus", "Peony", "Hydrangea",
];

const BLANK = {
  variety: "", quantity: "", unit_cost: "",
  intake_date: new Date().toISOString().slice(0, 10), source: "",
};

export default function InventoryClient({ batches, openOrders }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function api(method, body, msg) {
    const res = await fetch("/api/inventory", {
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

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const isEdit = Boolean(editing);
    const res = await api(
      isEdit ? "PATCH" : "POST",
      isEdit ? { ...form, id: editing.id, edit: true } : form,
      isEdit ? "Batch updated" : "Added to inventory"
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

  function startEdit(item) {
    setForm({
      variety: item.variety || "",
      quantity: item.quantity ?? "",
      unit_cost: item.unit_cost ?? "",
      intake_date: String(item.intake_date).slice(0, 10),
      source: item.source || "",
    });
    setEditing(item);
    setError("");
  }

  const formBody = (
    <form className="stack" onSubmit={submit}>
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
          <input type="number" min="0" value={form.quantity}
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
        {saving ? "Saving..." : editing ? "Save changes" : "Add to inventory"}
      </button>
    </form>
  );

  return (
    <>
      <button className="btn btn-block" onClick={() => { setShowForm(!showForm); setEditing(null); setForm(BLANK); }} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ Log new stem intake"}
      </button>

      {showForm && !editing && (
        <div className="card" style={{ marginBottom: 14 }}>{formBody}</div>
      )}

      {editing && (
        <Modal title={`Edit batch — ${editing.variety}`} onClose={() => { setEditing(null); setForm(BLANK); }}>
          {formBody}
        </Modal>
      )}

      {batches.length === 0 && !showForm && (
        <div className="empty">
          No inventory yet. Log what comes in each week so you can see what is left before ordering more.
        </div>
      )}

      <div className="stack stagger">
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
                    if (Number.isFinite(v) && v !== item.quantity) api("PATCH", { id: item.id, quantity: v }, "Quantity updated");
                  }}
                  disabled={!active}
                />
                {active && (
                  <>
                    <select
                      className="inline-select"
                      value={item.assigned_order_id || ""}
                      onChange={(e) => api("PATCH", { id: item.id, assigned_order_id: e.target.value || null }, "Assignment updated")}
                    >
                      <option value="">Available</option>
                      {openOrders.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.customer_name} · {fmtDate(o.delivery_date)}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={() => api("PATCH", { id: item.id, status: "used" }, "Marked used")}>
                      Mark used
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => api("PATCH", { id: item.id, status: "waste" }, "Marked waste")}>
                      Waste
                    </button>
                  </>
                )}
                {assigned && active && (
                  <span className="pill pill-wine">→ {assigned.customer_name}</span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Edit</button>
                {confirmId === item.id ? (
                  <>
                    <span className="error-text">Delete?</span>
                    <button className="btn btn-sm" style={{ background: "#a04a2e" }}
                      onClick={() => { api("DELETE", { id: item.id }, "Batch deleted"); setConfirmId(null); }}>
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
