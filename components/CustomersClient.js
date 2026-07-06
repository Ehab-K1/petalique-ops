"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, money } from "./ui";
import { Modal, toast } from "./client";

const TYPES = [
  ["retail", "Retail"],
  ["planner", "Event planner"],
  ["venue", "Venue"],
  ["corporate", "Corporate"],
  ["wholesale", "Wholesale"],
];

const BLANK = { name: "", phone: "", email: "", type: "retail", company: "", notes: "" };

export default function CustomersClient({ customers }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function api(method, body, msg) {
    const res = await fetch("/api/customers", {
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
      isEdit ? "Customer updated" : "Customer added"
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

  function startEdit(c) {
    setForm({
      name: c.name || "", phone: c.phone || "", email: c.email || "",
      type: c.type || "retail", company: c.company || "", notes: c.notes || "",
    });
    setEditing(c);
    setError("");
  }

  const list = useMemo(() => {
    let l = filter === "all" ? customers : customers.filter((c) => c.type === filter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      l = l.filter((c) =>
        [c.name, c.phone, c.email, c.company, c.notes]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
      );
    }
    return l;
  }, [customers, filter, q]);

  const b2bCount = customers.filter((c) => c.type !== "retail").length;

  const formBody = (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid-2">
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="form-grid-2">
        <label className="field">
          <span>Phone, optional</span>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label className="field">
          <span>Email, optional</span>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Company or venue, optional</span>
        <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
      </label>
      <label className="field">
        <span>Notes, optional</span>
        <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Preferences, event dates, referral source" />
      </label>
      {error && <div className="error-text">{error}</div>}
      <button className="btn" type="submit" disabled={saving}>
        {saving ? "Saving..." : editing ? "Save changes" : "Add customer"}
      </button>
    </form>
  );

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="muted">{customers.length} total · {b2bCount} B2B</span>
        <select className="inline-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All types</option>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <button className="btn btn-block" onClick={() => { setShowForm(!showForm); setEditing(null); setForm(BLANK); }} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ Add customer"}
      </button>

      {showForm && !editing && (
        <div className="card" style={{ marginBottom: 14 }}>{formBody}</div>
      )}

      {editing && (
        <Modal title={`Edit — ${editing.name}`} onClose={() => { setEditing(null); setForm(BLANK); }}>
          {formBody}
        </Modal>
      )}

      {list.length === 0 && !showForm && (
        <div className="empty">No customers here yet. Every planner, venue, and repeat buyer belongs on this list.</div>
      )}

      <div className="stack stagger">
        {list.map((c) => (
          <div className="card" key={c.id}>
            <div className="row" style={{ borderBottom: "none", padding: 0 }}>
              <div className="row-main">
                <div className="row-title">
                  {c.name}
                  {c.company ? <span className="muted"> · {c.company}</span> : null}
                </div>
                <div className="row-sub">
                  {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact info"}
                </div>
                <div className="row-sub">
                  {c.order_count > 0
                    ? `${c.order_count} order${c.order_count === 1 ? "" : "s"} · ${money(c.lifetime)} lifetime · last ${fmtDate(c.last_order)}`
                    : "No orders yet"}
                </div>
                {c.notes && <div className="row-sub">Note: {c.notes}</div>}
              </div>
              <div className="row-side">
                <select
                  className="inline-select"
                  value={c.type}
                  onChange={(e) => api("PATCH", { id: c.id, type: e.target.value }, "Type updated")}
                >
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>
                {confirmId === c.id ? (
                  <>
                    <span className="error-text">Delete?</span>
                    <button className="btn btn-sm" style={{ background: "#a8462b" }}
                      onClick={() => { api("DELETE", { id: c.id }, "Customer deleted"); setConfirmId(null); }}>
                      Yes
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>No</button>
                  </>
                ) : (
                  <button className="btn-danger btn" onClick={() => setConfirmId(c.id)}>Delete</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
