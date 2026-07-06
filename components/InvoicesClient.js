"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, money } from "./ui";
import { Modal, Segmented, CopyButton, toast } from "./client";

const KIND_LABEL = { invoice: "Invoice", quote: "Quotation" };
const STATUS_STYLE = {
  draft: "pill-gray", sent: "pill-amber", accepted: "pill-wine",
  paid: "pill-green", void: "pill-rust",
};

const BLANK = {
  kind: "invoice",
  customer_id: "", customer_name: "", customer_email: "", customer_phone: "", customer_address: "",
  order_id: "",
  items: [{ desc: "", qty: 1, price: "" }],
  tax_rate: 13, discount: 0,
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: "", notes: "",
};

function totalsOf(items, taxRate, discount) {
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const disc = Number(discount) || 0;
  const taxable = Math.max(0, subtotal - disc);
  const tax = taxable * ((Number(taxRate) || 0) / 100);
  return { subtotal, tax, total: taxable + tax };
}

export default function InvoicesClient({ invoices, customers, orders }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [kindFilter, setKindFilter] = useState("all");

  async function api(method, body, msg) {
    const res = await fetch("/api/invoices", {
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

  function setItem(i, patch) {
    const items = form.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    setForm({ ...form, items });
  }

  function pickCustomer(id) {
    const c = customers.find((x) => String(x.id) === String(id));
    if (c) {
      setForm({
        ...form, customer_id: c.id, customer_name: c.name,
        customer_email: c.email || "", customer_phone: c.phone || "",
      });
    } else {
      setForm({ ...form, customer_id: "" });
    }
  }

  function pickOrder(id) {
    const o = orders.find((x) => String(x.id) === String(id));
    if (o) {
      setForm({
        ...form,
        order_id: o.id,
        customer_name: form.customer_name || o.customer_name,
        items: form.items.some((it) => it.desc)
          ? form.items
          : [{ desc: o.items_desc || "Floral arrangement", qty: 1, price: Number(o.total) || "" }],
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
      isEdit ? { ...form, id: editing.id, edit: true } : form,
      isEdit ? "Saved" : `${KIND_LABEL[form.kind]} created`
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

  function startEdit(inv) {
    setForm({
      kind: inv.kind,
      customer_id: inv.customer_id || "",
      customer_name: inv.customer_name || "",
      customer_email: inv.customer_email || "",
      customer_phone: inv.customer_phone || "",
      customer_address: inv.customer_address || "",
      order_id: inv.order_id || "",
      items: Array.isArray(inv.items) && inv.items.length ? inv.items : [{ desc: "", qty: 1, price: "" }],
      tax_rate: inv.tax_rate ?? 13,
      discount: inv.discount ?? 0,
      issue_date: String(inv.issue_date).slice(0, 10),
      due_date: inv.due_date ? String(inv.due_date).slice(0, 10) : "",
      notes: inv.notes || "",
    });
    setEditing(inv);
    setError("");
  }

  const filtered = useMemo(() => {
    if (kindFilter === "all") return invoices;
    return invoices.filter((i) => i.kind === kindFilter);
  }, [invoices, kindFilter]);

  const t = totalsOf(form.items, form.tax_rate, form.discount);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const formBody = (
    <form className="stack" onSubmit={submit}>
      {!editing && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Segmented
            options={[["invoice", "Invoice"], ["quote", "Quotation"]]}
            value={form.kind}
            onChange={(v) => setForm({ ...form, kind: v })}
          />
        </div>
      )}
      <div className="form-grid-2">
        {customers.length > 0 && (
          <label className="field">
            <span>Existing customer, optional</span>
            <select value={form.customer_id} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">One-time customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Link to order, optional</span>
          <select value={form.order_id} onChange={(e) => pickOrder(e.target.value)}>
            <option value="">No linked order</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>#{o.id} · {o.customer_name} · {fmtDate(o.delivery_date)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid-2">
        <label className="field">
          <span>Bill to — name</span>
          <input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required />
        </label>
        <label className="field">
          <span>Email, optional</span>
          <input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
        </label>
      </div>
      <div className="form-grid-2">
        <label className="field">
          <span>Phone, optional</span>
          <input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
        </label>
        <label className="field">
          <span>Address, optional</span>
          <input value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} />
        </label>
      </div>

      <div>
        <span style={{ display: "block", fontSize: 12, fontWeight: 550, color: "var(--ink-soft)", marginBottom: 6 }}>
          Line items
        </span>
        <div className="stack" style={{ gap: 8 }}>
          {form.items.map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 64px 90px 30px", gap: 8, alignItems: "center" }}>
              <input placeholder="Description — e.g. Bridal bouquet, garden roses" value={it.desc}
                onChange={(e) => setItem(i, { desc: e.target.value })} />
              <input type="number" min="0" step="1" placeholder="Qty" value={it.qty}
                onChange={(e) => setItem(i, { qty: e.target.value })} />
              <input type="number" min="0" step="0.01" placeholder="Price" value={it.price}
                onChange={(e) => setItem(i, { price: e.target.value })} />
              <button type="button" className="modal-x" style={{ width: 26, height: 26, fontSize: 12 }}
                onClick={() => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })}
                disabled={form.items.length === 1}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
          onClick={() => setForm({ ...form, items: [...form.items, { desc: "", qty: 1, price: "" }] })}>
          + Add line
        </button>
      </div>

      <div className="form-grid-2">
        <label className="field">
          <span>Tax rate %</span>
          <input type="number" min="0" step="0.01" value={form.tax_rate}
            onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
        </label>
        <label className="field">
          <span>Discount $, optional</span>
          <input type="number" min="0" step="0.01" value={form.discount}
            onChange={(e) => setForm({ ...form, discount: e.target.value })} />
        </label>
      </div>
      <div className="form-grid-2">
        <label className="field">
          <span>Issue date</span>
          <input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} required />
        </label>
        <label className="field">
          <span>{form.kind === "quote" ? "Valid until, optional" : "Due date, optional"}</span>
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Notes on the document, optional</span>
        <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Payment by e-transfer to hello@petaliqueflora.com · 50% deposit to confirm" />
      </label>

      <div className="doc-totals" style={{ maxWidth: "none" }}>
        <div className="trow"><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
        {Number(form.discount) > 0 && <div className="trow"><span>Discount</span><span>−{money(form.discount)}</span></div>}
        <div className="trow"><span>Tax ({form.tax_rate || 0}%)</span><span>{money(t.tax)}</span></div>
        <div className="trow grand"><span>Total</span><span>{money(t.total)}</span></div>
      </div>

      {error && <div className="error-text">{error}</div>}
      <button className="btn" type="submit" disabled={saving}>
        {saving ? "Saving..." : editing ? "Save changes" : `Create ${KIND_LABEL[form.kind].toLowerCase()}`}
      </button>
    </form>
  );

  return (
    <>
      <div className="toolbar">
        <Segmented
          options={[["all", "All"], ["invoice", "Invoices"], ["quote", "Quotes"]]}
          value={kindFilter} onChange={setKindFilter}
        />
      </div>

      <button className="btn btn-block" onClick={() => { setShowForm(!showForm); setEditing(null); setForm(BLANK); }} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ New invoice or quote"}
      </button>

      {showForm && !editing && <div className="card" style={{ marginBottom: 14 }}>{formBody}</div>}

      {editing && (
        <Modal title={`Edit ${editing.number}`} onClose={() => { setEditing(null); setForm(BLANK); }}>
          {formBody}
        </Modal>
      )}

      {filtered.length === 0 && !showForm && (
        <div className="empty">Nothing here yet. Create your first invoice or quotation above.</div>
      )}

      <div className="stack stagger">
        {filtered.map((inv) => {
          const t2 = totalsOf(Array.isArray(inv.items) ? inv.items : [], inv.tax_rate, inv.discount);
          const link = `${origin}/i/${inv.token}`;
          return (
            <div className="card" key={inv.id}>
              <div className="row" style={{ borderBottom: "none", padding: 0 }}>
                <div className="row-main">
                  <div className="row-title">
                    {inv.number}
                    <span className="muted"> · {inv.customer_name}</span>
                  </div>
                  <div className="row-sub">
                    {KIND_LABEL[inv.kind]} · issued {fmtDate(inv.issue_date)}
                    {inv.due_date ? ` · ${inv.kind === "quote" ? "valid until" : "due"} ${fmtDate(inv.due_date)}` : ""}
                    {" · "}{money(t2.total)}
                  </div>
                </div>
                <div className="row-side">
                  <span className={"pill " + (STATUS_STYLE[inv.status] || "pill-gray")}>{inv.status}</span>
                </div>
              </div>
              <div className="row-side" style={{ marginTop: 10, justifyContent: "flex-start" }}>
                <a className="btn btn-ghost btn-sm" href={`/i/${inv.token}`} target="_blank" rel="noreferrer">
                  View / PDF
                </a>
                <CopyButton text={link} label="Copy share link" small />
                <select
                  className="inline-select"
                  value={inv.status}
                  onChange={(e) => api("PATCH", { id: inv.id, status: e.target.value }, "Status updated")}
                >
                  {["draft", "sent", ...(inv.kind === "quote" ? ["accepted"] : []), "paid", "void"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {inv.kind === "quote" && (
                  <button className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      const res = await api("PATCH", { id: inv.id, convert: true });
                      if (res.ok) {
                        const d = await res.json().catch(() => ({}));
                        toast(d.number ? `Converted to ${d.number}` : "Converted to invoice");
                      }
                    }}>
                    Convert to invoice
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(inv)}>Edit</button>
                {confirmId === inv.id ? (
                  <>
                    <span className="error-text">Delete?</span>
                    <button className="btn btn-sm" style={{ background: "#a8462b" }}
                      onClick={() => { api("DELETE", { id: inv.id }, "Deleted"); setConfirmId(null); }}>
                      Yes
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>No</button>
                  </>
                ) : (
                  <button className="btn-danger btn" onClick={() => setConfirmId(inv.id)}>Delete</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
