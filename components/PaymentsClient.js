"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, money } from "./ui";
import { Modal, toast, CountUp, Tilt } from "./client";

const METHODS = [
  ["cash", "Cash"],
  ["e_transfer", "E-transfer"],
  ["card", "Card"],
  ["paypal", "PayPal"],
  ["other", "Other"],
];

const methodLabel = (m) => (METHODS.find(([v]) => v === m) || [])[1] || m;

const BLANK = {
  order_id: "", customer_name: "", amount: "", method: "cash",
  paid_date: new Date().toISOString().slice(0, 10), reference: "", notes: "",
};

export default function PaymentsClient({ payments, openOrders, monthTotal, byMethod, outstanding }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  async function api(method, body, msg) {
    const res = await fetch("/api/payments", {
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

  function pickOrder(id) {
    const o = openOrders.find((x) => String(x.id) === String(id));
    if (o) {
      setForm({
        ...form,
        order_id: o.id,
        customer_name: o.customer_name,
        amount: form.amount || (Number(o.total) > 0 ? o.total : ""),
      });
    } else {
      setForm({ ...form, order_id: "" });
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const isEdit = Boolean(editing);
    const res = await api(
      isEdit ? "PATCH" : "POST",
      isEdit ? { ...form, id: editing.id } : form,
      isEdit ? "Payment updated" : "Payment recorded"
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

  function startEdit(p) {
    setForm({
      order_id: p.order_id || "",
      customer_name: p.customer_name || p.order_customer || "",
      amount: p.amount,
      method: p.method,
      paid_date: String(p.paid_date).slice(0, 10),
      reference: p.reference || "",
      notes: p.notes || "",
    });
    setEditing(p);
    setError("");
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return payments;
    const s = q.trim().toLowerCase();
    return payments.filter((p) =>
      [p.customer_name, p.order_customer, p.reference, p.notes, methodLabel(p.method)]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
    );
  }, [payments, q]);

  const formBody = (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Link to an order, optional but recommended</span>
        <select value={form.order_id} onChange={(e) => pickOrder(e.target.value)}>
          <option value="">No linked order</option>
          {openOrders.map((o) => (
            <option key={o.id} value={o.id}>
              #{o.id} · {o.customer_name} · {fmtDate(o.delivery_date)}
              {Number(o.total) > 0 ? ` · ${money(o.total)}` : ""}
              {o.payment_status !== "paid" ? ` (${o.payment_status})` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-2">
        <label className="field">
          <span>Amount</span>
          <input type="number" step="0.01" min="0.01" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} required placeholder="120.00" />
        </label>
        <label className="field">
          <span>Method</span>
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="form-grid-2">
        <label className="field">
          <span>Date received</span>
          <input type="date" value={form.paid_date}
            onChange={(e) => setForm({ ...form, paid_date: e.target.value })} required />
        </label>
        <label className="field">
          <span>From (customer), optional</span>
          <input value={form.customer_name}
            onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
        </label>
      </div>
      <div className="form-grid-2">
        <label className="field">
          <span>Reference #, optional</span>
          <input value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            placeholder="e-transfer confirmation, receipt #" />
        </label>
        <label className="field">
          <span>Notes, optional</span>
          <input value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
      </div>
      {error && <div className="error-text">{error}</div>}
      <button className="btn" type="submit" disabled={saving}>
        {saving ? "Saving..." : editing ? "Save changes" : "Record payment"}
      </button>
    </form>
  );

  return (
    <>
      <div className="grid grid-3 stagger" style={{ marginBottom: 16 }}>
        <Tilt className="card stat">
          <div className="stat-value"><CountUp value={monthTotal.s} money /></div>
          <div className="stat-label">Collected this month ({monthTotal.c} payments)</div>
        </Tilt>
        <Tilt className="card stat">
          <div className="stat-value"><CountUp value={outstanding.s} money /></div>
          <div className="stat-label">Still outstanding ({outstanding.c} orders)</div>
        </Tilt>
        <div className="card stat">
          <div className="stat-label" style={{ marginBottom: 6 }}>Last 30 days by method</div>
          {byMethod.length === 0 ? (
            <div className="muted">No payments yet</div>
          ) : (
            byMethod.map((m) => (
              <div key={m.method} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{methodLabel(m.method)}</span>
                <strong>{money(m.s)}</strong>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input placeholder="Search payments…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <button className="btn btn-block" onClick={() => { setShowForm(!showForm); setEditing(null); setForm(BLANK); }} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ Record payment"}
      </button>

      {showForm && !editing && <div className="card" style={{ marginBottom: 14 }}>{formBody}</div>}

      {editing && (
        <Modal title="Edit payment" onClose={() => { setEditing(null); setForm(BLANK); }}>
          {formBody}
        </Modal>
      )}

      {filtered.length === 0 && !showForm && (
        <div className="empty">No payments recorded yet. Every cash, e-transfer, or card payment belongs here.</div>
      )}

      <div className="stack stagger">
        {filtered.map((p) => (
          <div className="card" key={p.id}>
            <div className="row" style={{ borderBottom: "none", padding: 0 }}>
              <div className="row-main">
                <div className="row-title">
                  {money(p.amount)}
                  <span className="muted"> · {p.customer_name || p.order_customer || "Unlinked"}</span>
                </div>
                <div className="row-sub">
                  {fmtDate(p.paid_date)} · {methodLabel(p.method)}
                  {p.order_id ? ` · order #${p.order_id}` : ""}
                  {p.reference ? ` · ref ${p.reference}` : ""}
                </div>
                {p.notes && <div className="row-sub">Note: {p.notes}</div>}
              </div>
              <div className="row-side">
                <span className="pill pill-green">{methodLabel(p.method)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}>Edit</button>
                {confirmId === p.id ? (
                  <>
                    <span className="error-text">Delete?</span>
                    <button className="btn btn-sm" style={{ background: "#a8462b" }}
                      onClick={() => { api("DELETE", { id: p.id }, "Payment deleted"); setConfirmId(null); }}>
                      Yes
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>No</button>
                  </>
                ) : (
                  <button className="btn-danger btn" onClick={() => setConfirmId(p.id)}>Delete</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
