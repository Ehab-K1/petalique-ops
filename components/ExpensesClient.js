"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, money, Leaderboard } from "./ui";
import { Modal, toast, CountUp, Tilt } from "./client";

export const CATEGORIES = [
  ["flowers", "🌷 Flowers & stems"],
  ["materials", "🎀 Materials & supplies"],
  ["services", "🧾 Services & subscriptions"],
  ["legal", "⚖️ Legal & professional"],
  ["payroll", "👥 Payroll & people"],
  ["delivery", "🚗 Delivery & fuel"],
  ["marketing", "📣 Marketing & ads"],
  ["rent", "🏠 Rent & utilities"],
  ["other", "📦 Other"],
];

const catLabel = (c) => (CATEGORIES.find(([v]) => v === c) || [])[1] || c;

const METHODS = ["", "Cash", "Card", "E-transfer", "PayPal", "Bank transfer", "Other"];

const BLANK = {
  category: "flowers", description: "", vendor: "", amount: "",
  expense_date: new Date().toISOString().slice(0, 10),
  method: "", recurring: false, notes: "",
};

export default function ExpensesClient({ expenses, thisMonth, lastMonth, thisYear, byCategory, revenueThisMonth }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  async function api(method, body, msg) {
    const res = await fetch("/api/expenses", {
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
      isEdit ? { ...form, id: editing.id } : form,
      isEdit ? "Expense updated" : "Expense logged"
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

  function startEdit(x) {
    setForm({
      category: x.category || "other",
      description: x.description || "",
      vendor: x.vendor || "",
      amount: x.amount ?? "",
      expense_date: String(x.expense_date).slice(0, 10),
      method: x.method || "",
      recurring: Boolean(x.recurring),
      notes: x.notes || "",
    });
    setEditing(x);
    setError("");
  }

  const filtered = useMemo(() => {
    let list = expenses;
    if (catFilter !== "all") list = list.filter((x) => x.category === catFilter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((x) =>
        [x.description, x.vendor, x.notes, catLabel(x.category)]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
      );
    }
    return list;
  }, [expenses, q, catFilter]);

  const profit = Number(revenueThisMonth.s) - Number(thisMonth.s);
  const margin = Number(revenueThisMonth.s) > 0 ? (profit / Number(revenueThisMonth.s)) * 100 : null;

  const formBody = (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid-2">
        <label className="field">
          <span>Category</span>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Amount</span>
          <input type="number" step="0.01" min="0.01" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} required placeholder="45.00" />
        </label>
      </div>
      <label className="field">
        <span>What was it for?</span>
        <input value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="e.g. 200 rose stems, ribbon rolls, monthly bookkeeping" required />
      </label>
      <div className="form-grid-2">
        <label className="field">
          <span>Paid to (vendor), optional</span>
          <input value={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Impacts Florals" />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={form.expense_date}
            onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required />
        </label>
      </div>
      <div className="form-grid-2">
        <label className="field">
          <span>Payment method, optional</span>
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {METHODS.map((m) => <option key={m} value={m}>{m || "—"}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Notes, optional</span>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
        <input type="checkbox" checked={form.recurring} style={{ width: "auto" }}
          onChange={(e) => setForm({ ...form, recurring: e.target.checked })} />
        Recurring expense (rent, subscription, retainer…)
      </label>
      {error && <div className="error-text">{error}</div>}
      <button className="btn" type="submit" disabled={saving}>
        {saving ? "Saving..." : editing ? "Save changes" : "Log expense"}
      </button>
    </form>
  );

  return (
    <>
      <div className="grid grid-4 stagger" style={{ marginBottom: 16 }}>
        <Tilt className="card stat">
          <div className="stat-value"><CountUp value={thisMonth.s} money /></div>
          <div className="stat-label">Spent this month ({thisMonth.c} expenses)</div>
        </Tilt>
        <Tilt className="card stat">
          <div className="stat-value"><CountUp value={lastMonth.s} money /></div>
          <div className="stat-label">Last month</div>
        </Tilt>
        <Tilt className="card stat">
          <div className="stat-value"><CountUp value={thisYear.s} money /></div>
          <div className="stat-label">This year</div>
        </Tilt>
        <Tilt className="card stat">
          <div className="stat-value" style={{ color: profit >= 0 ? "var(--green-bright)" : "var(--rust)" }}>
            <CountUp value={profit} money />
          </div>
          <div className="stat-label">
            Profit this month{margin != null ? ` · ${margin.toFixed(0)}% margin` : ""}
          </div>
        </Tilt>
      </div>

      {byCategory.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Where the money went this month</div>
          <Leaderboard rows={byCategory.map((c) => ({ label: catLabel(c.category), value: Number(c.s) }))} />
        </div>
      )}

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input placeholder="Search expenses…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="inline-select" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories</option>
          {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <button className="btn btn-block" onClick={() => { setShowForm(!showForm); setEditing(null); setForm(BLANK); }} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ Log expense"}
      </button>

      {showForm && !editing && <div className="card" style={{ marginBottom: 14 }}>{formBody}</div>}

      {editing && (
        <Modal title="Edit expense" onClose={() => { setEditing(null); setForm(BLANK); }}>
          {formBody}
        </Modal>
      )}

      {filtered.length === 0 && !showForm && (
        <div className="empty">No expenses match. Log flower buys, materials, services, legal fees, payroll — everything.</div>
      )}

      <div className="stack stagger">
        {filtered.map((x) => (
          <div className="card" key={x.id}>
            <div className="row" style={{ borderBottom: "none", padding: 0 }}>
              <div className="row-main">
                <div className="row-title">
                  {money(x.amount)}
                  <span className="muted"> · {x.description}</span>
                </div>
                <div className="row-sub">
                  {fmtDate(x.expense_date)}
                  {x.vendor ? ` · ${x.vendor}` : ""}
                  {x.method ? ` · ${x.method}` : ""}
                </div>
                {x.notes && <div className="row-sub">Note: {x.notes}</div>}
              </div>
              <div className="row-side">
                <span className="pill pill-wine">{catLabel(x.category)}</span>
                {x.recurring && <span className="pill pill-gold">↻ Recurring</span>}
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(x)}>Edit</button>
                {confirmId === x.id ? (
                  <>
                    <span className="error-text">Delete?</span>
                    <button className="btn btn-sm" style={{ background: "#a8462b" }}
                      onClick={() => { api("DELETE", { id: x.id }, "Expense deleted"); setConfirmId(null); }}>
                      Yes
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>No</button>
                  </>
                ) : (
                  <button className="btn-danger btn" onClick={() => setConfirmId(x.id)}>Delete</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
