"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtDate, money } from "./ui";
import { Modal, toast, toastUndo, CountUp, Tilt } from "./client";

const METHODS = [
  ["cash", "Cash"],
  ["e_transfer", "E-transfer"],
  ["card", "Card"],
  ["paypal", "PayPal"],
  ["other", "Other"],
];

const methodLabel = (m) => (METHODS.find(([v]) => v === m) || [])[1] || m;

const BLANK = {
  order_id: "", invoice_id: "", customer_name: "", amount: "", method: "cash",
  paid_date: new Date().toISOString().slice(0, 10), reference: "", notes: "",
};

export default function PaymentsClient({ payments, orders, invoices, monthTotal, byMethod, outstanding }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("new")) setShowForm(true);
  }, []);

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

  function removePayment(p) {
    api("DELETE", { id: p.id }).then((res) => {
      if (res.ok) {
        toastUndo(`Payment of ${money(p.amount)} moved to trash`, async () => {
          await api("PATCH", { id: p.id, restore: true }, "Payment restored");
        });
      }
    });
  }

  function pickOrder(id) {
    const o = orders.find((x) => String(x.id) === String(id));
    if (o) {
      setForm({
        ...form,
        order_id: o.id,
        customer_name: form.customer_name || o.customer_name,
        amount: form.amount || (Number(o.total) > 0 ? o.total : ""),
      });
    } else {
      setForm({ ...form, order_id: "" });
    }
  }

  function pickInvoice(id) {
    const inv = invoices.find((x) => String(x.id) === String(id));
    if (inv) {
      setForm({
        ...form,
        invoice_id: inv.id,
        order_id: inv.order_id || form.order_id,
        customer_name: form.customer_name || inv.customer_name,
        amount: form.amount || (inv.balance > 0 ? inv.balance.toFixed(2) : ""),
      });
    } else {
      setForm({ ...form, invoice_id: "" });
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
      isEdit ? "Payment updated" : "Payment recorded — statuses synced"
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
      invoice_id: p.invoice_id || "",
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
      [p.customer_name, p.order_customer, p.linked_customer, p.invoice_number, p.reference, p.notes, methodLabel(p.method)]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
    );
  }, [payments, q]);

  const selInvoice = invoices.find((x) => String(x.id) === String(form.invoice_id));

  const formBody = (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid-2">
        <label className="field">
          <span>Link to an invoice / quote</span>
          <select value={form.invoice_id} onChange={(e) => pickInvoice(e.target.value)}>
            <option value="">No linked invoice</option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.number} · {inv.customer_name}
                {inv.balance > 0 ? ` · ${money(inv.balance)} due` : " · paid"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Link to an order</span>
          <select value={form.order_id} onChange={(e) => pickOrder(e.target.value)}>
            <option value="">No linked order</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.id} · {o.customer_name} · {fmtDate(o.delivery_date)}
                {Number(o.total) > 0 ? ` · ${money(o.total)}` : ""}
                {o.payment_status !== "paid" ? ` (${o.payment_status})` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selInvoice && selInvoice.balance > 0 && (
        <div className="muted" style={{ marginTop: -4 }}>
          {selInvoice.number}: {money(selInvoice.paid)} paid of {money(selInvoice.total)} — balance {money(selInvoice.balance)}.
        </div>
      )}
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
        <Link href="/orders?filter=unpaid" className="stat-link">
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={outstanding.s} money /></div>
            <div className="stat-label">Still outstanding ({outstanding.c} orders)</div>
            <div className="stat-hint">See who owes →</div>
          </Tilt>
        </Link>
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
                  <span className="muted">
                    {" · "}
                    {p.customer_id
                      ? <Link href={`/customers/${p.customer_id}`} className="link-green">{p.linked_customer || p.customer_name || p.order_customer}</Link>
                      : (p.customer_name || p.order_customer || "Unlinked")}
                  </span>
                </div>
                <div className="row-sub">
                  {fmtDate(p.paid_date)} · {methodLabel(p.method)}
                  {p.order_id ? <> · <Link href={`/orders/${p.order_id}`} className="link-green">order #{p.order_id}</Link></> : null}
                  {p.invoice_number ? ` · ${p.invoice_number}` : ""}
                  {p.reference ? ` · ref ${p.reference}` : ""}
                </div>
                {p.notes && <div className="row-sub">Note: {p.notes}</div>}
              </div>
              <div className="row-side">
                <span className="pill pill-green">{methodLabel(p.method)}</span>
                {p.order_id && <Link href={`/orders/${p.order_id}`} className="btn btn-ghost btn-sm">Order →</Link>}
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}>Edit</button>
                <button className="btn-danger btn" onClick={() => removePayment(p)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
