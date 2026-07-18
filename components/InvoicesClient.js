"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtDate, money } from "./ui";
import { Modal, Segmented, CopyButton, toast, toastUndo } from "./client";

const KIND_LABEL = { invoice: "Invoice", quote: "Quotation" };
const STATUS_STYLE = {
  draft: "pill-gray", sent: "pill-amber", accepted: "pill-wine",
  partial: "pill-amber", paid: "pill-green", void: "pill-rust",
};
const METHODS = [["cash", "Cash"], ["e_transfer", "E-transfer"], ["card", "Card"], ["paypal", "PayPal"], ["other", "Other"]];

function blankForm(defaultTax) {
  return {
    kind: "invoice",
    customer_id: "", customer_name: "", customer_email: "", customer_phone: "", customer_address: "",
    order_id: "",
    items: [{ section: "", name: "", detail: "", qty: 1, price: "" }],
    tax_rate: defaultTax, discount: 0,
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "", event_date: "", deposit_pct: "", notes: "",
  };
}

// backward-compat: older invoices were saved with {desc, qty, price} only
function normalizeItem(it) {
  return {
    section: it.section || "",
    name: it.name ?? it.desc ?? "",
    detail: it.detail || "",
    qty: it.qty ?? 1,
    price: it.price ?? "",
  };
}

function totalsOf(items, taxRate, discount) {
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const disc = Number(discount) || 0;
  const taxable = Math.max(0, subtotal - disc);
  const tax = taxable * ((Number(taxRate) || 0) / 100);
  return { subtotal, tax, total: taxable + tax };
}

export default function InvoicesClient({ invoices, customers, orders, defaultTax = 13 }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null); // invoice being paid
  const [form, setForm] = useState(blankForm(defaultTax));
  const [payForm, setPayForm] = useState({ amount: "", method: "e_transfer", paid_date: new Date().toISOString().slice(0, 10), reference: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [kindFilter, setKindFilter] = useState("all");

  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);

  // Deep links: ?new=1, ?new=quote, ?customer=ID, ?open=ID (edit straight away)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const n = p.get("new");
    if (n) {
      const f = blankForm(defaultTax);
      if (n === "quote") f.kind = "quote";
      const cid = p.get("customer");
      if (cid) {
        const c = customers.find((x) => String(x.id) === String(cid));
        if (c) {
          f.customer_id = c.id; f.customer_name = c.name;
          f.customer_email = c.email || ""; f.customer_phone = c.phone || "";
        }
      }
      setForm(f);
      setShowForm(true);
    }
    const openId = p.get("open");
    if (openId) {
      const inv = invoices.find((x) => String(x.id) === String(openId));
      if (inv) startEdit(inv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function removeInvoice(inv) {
    api("DELETE", { id: inv.id }).then((res) => {
      if (res.ok) {
        toastUndo(`${inv.number} moved to trash`, async () => {
          await api("PATCH", { id: inv.id, restore: true }, "Restored");
        });
      }
    });
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
        customer_id: form.customer_id || o.customer_id || "",
        customer_name: form.customer_name || o.customer_name,
        items: form.items.some((it) => it.name)
          ? form.items
          : [{ section: "", name: o.items_desc || "Floral arrangement", detail: "", qty: 1, price: Number(o.total) || "" }],
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
      setForm(blankForm(defaultTax));
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
      items: Array.isArray(inv.items) && inv.items.length
        ? inv.items.map(normalizeItem)
        : [{ section: "", name: "", detail: "", qty: 1, price: "" }],
      tax_rate: inv.tax_rate ?? defaultTax,
      discount: inv.discount ?? 0,
      issue_date: String(inv.issue_date).slice(0, 10),
      due_date: inv.due_date ? String(inv.due_date).slice(0, 10) : "",
      event_date: inv.event_date || "",
      deposit_pct: inv.deposit_pct || "",
      notes: inv.notes || "",
    });
    setEditing(inv);
    setError("");
  }

  function startPay(inv, balance) {
    setPaying(inv);
    setPayForm({
      amount: balance > 0 ? balance.toFixed(2) : "",
      method: "e_transfer",
      paid_date: new Date().toISOString().slice(0, 10),
      reference: "",
    });
  }

  async function submitPay(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payForm,
        invoice_id: paying.id,
        order_id: paying.order_id || "",
        customer_name: paying.customer_name,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast("Payment recorded — invoice status updated");
      setPaying(null);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast(d.error || "Could not record payment", "err");
    }
  }

  const filtered = useMemo(() => {
    if (kindFilter === "all") return invoices;
    if (kindFilter === "unpaid") {
      return invoices.filter((i) => i.kind === "invoice" && !["paid", "void"].includes(i.status));
    }
    return invoices.filter((i) => i.kind === kindFilter);
  }, [invoices, kindFilter]);

  const t = totalsOf(form.items, form.tax_rate, form.discount);

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
        <div className="stack" style={{ gap: 10 }}>
          {form.items.map((it, i) => (
            <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10 }}>
              <input placeholder="Day / section header, optional — e.g. Friday, August 7, 2026"
                value={it.section} onChange={(e) => setItem(i, { section: e.target.value })}
                style={{ fontSize: 12.5, marginBottom: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 90px 30px", gap: 8, alignItems: "center" }}>
                <input placeholder="Item name — e.g. Bridal Bouquet (Red & White)" value={it.name}
                  onChange={(e) => setItem(i, { name: e.target.value })} />
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
              <textarea rows={2} placeholder="Description shown under the item name, optional"
                value={it.detail} onChange={(e) => setItem(i, { detail: e.target.value })}
                style={{ marginTop: 8, fontSize: 13 }} />
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
          onClick={() => setForm({ ...form, items: [...form.items, { section: "", name: "", detail: "", qty: 1, price: "" }] })}>
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
      <div className="form-grid-2">
        <label className="field">
          <span>Event date(s), optional</span>
          <input value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })}
            placeholder="e.g. Aug 7 & Aug 8, 2026" />
        </label>
        <label className="field">
          <span>Deposit % to secure booking, optional</span>
          <input type="number" min="0" max="100" step="1" value={form.deposit_pct}
            onChange={(e) => setForm({ ...form, deposit_pct: e.target.value })} placeholder="50" />
        </label>
      </div>
      <label className="field">
        <span>Notes / booking steps, optional — one per line, numbered automatically</span>
        <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder={"Please review the quotation details above for accuracy.\nSend Interac e-Transfer to: hello@petaliqueflora.com\nFinal floral requests must be finalized 14 days prior to the event."} />
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
          options={[["all", "All"], ["invoice", "Invoices"], ["quote", "Quotes"], ["unpaid", "Awaiting payment"]]}
          value={kindFilter} onChange={setKindFilter}
        />
      </div>

      <button className="btn btn-block" onClick={() => { setShowForm(!showForm); setEditing(null); setForm(blankForm(defaultTax)); }} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ New invoice or quote"}
      </button>

      {showForm && !editing && <div className="card" style={{ marginBottom: 14 }}>{formBody}</div>}

      {editing && (
        <Modal title={`Edit ${editing.number}`} onClose={() => { setEditing(null); setForm(blankForm(defaultTax)); }}>
          {formBody}
        </Modal>
      )}

      {paying && (
        <Modal title={`Record payment — ${paying.number}`} onClose={() => setPaying(null)}>
          <form className="stack" onSubmit={submitPay}>
            <div className="form-grid-2">
              <label className="field">
                <span>Amount</span>
                <input type="number" step="0.01" min="0.01" required autoFocus value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
              </label>
              <label className="field">
                <span>Method</span>
                <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <div className="form-grid-2">
              <label className="field">
                <span>Date received</span>
                <input type="date" value={payForm.paid_date}
                  onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })} required />
              </label>
              <label className="field">
                <span>Reference, optional</span>
                <input value={payForm.reference}
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
              </label>
            </div>
            <button className="btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Record payment"}</button>
          </form>
        </Modal>
      )}

      {filtered.length === 0 && !showForm && (
        <div className="empty">Nothing here yet. Create your first invoice or quotation above.</div>
      )}

      <div className="stack stagger">
        {filtered.map((inv) => {
          const t2 = totalsOf(Array.isArray(inv.items) ? inv.items : [], inv.tax_rate, inv.discount);
          const paid = Number(inv.paid) || 0;
          const balance = Math.max(0, t2.total - paid);
          const link = `${origin}/i/${inv.token}`;
          return (
            <div className="card" key={inv.id}>
              <div className="row" style={{ borderBottom: "none", padding: 0 }}>
                <div className="row-main">
                  <div className="row-title">
                    {inv.number}
                    <span className="muted">
                      {" · "}
                      {inv.customer_id
                        ? <Link href={`/customers/${inv.customer_id}`} className="link-green">{inv.customer_name}</Link>
                        : inv.customer_name}
                    </span>
                  </div>
                  <div className="row-sub">
                    {KIND_LABEL[inv.kind]} · issued {fmtDate(inv.issue_date)}
                    {inv.due_date ? ` · ${inv.kind === "quote" ? "valid until" : "due"} ${fmtDate(inv.due_date)}` : ""}
                    {" · "}{money(t2.total)}
                  </div>
                  {inv.kind === "invoice" && paid > 0 && (
                    <div className="row-sub">
                      <span className={"balance-chip " + (balance > 0 ? "due" : "clear")}>
                        {money(paid)} paid{balance > 0 ? ` · ${money(balance)} outstanding` : " · settled ✓"}
                      </span>
                    </div>
                  )}
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
                {inv.kind === "invoice" && balance > 0 && (
                  <button className="btn btn-sm btn-gold" onClick={() => startPay(inv, balance)}>
                    Record payment
                  </button>
                )}
                <select
                  className="inline-select"
                  value={inv.status}
                  onChange={(e) => api("PATCH", { id: inv.id, status: e.target.value }, "Status updated")}
                >
                  {["draft", "sent", ...(inv.kind === "quote" ? ["accepted"] : ["partial"]), "paid", "void"].map((s) => (
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
                {inv.order_id ? (
                  <Link href={`/orders/${inv.order_id}`} className="pill pill-green">Order #{inv.order_id} →</Link>
                ) : (
                  <button className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      const res = await api("PATCH", { id: inv.id, convertToOrder: true });
                      const d = await res.json().catch(() => ({}));
                      if (res.ok) {
                        toast(d.orderId ? `Order #${d.orderId} created` : "Converted to order");
                      } else {
                        toast(d.error || "Could not convert to an order.", "err");
                      }
                    }}>
                    → Convert to order
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(inv)}>Edit</button>
                <button className="btn-danger btn" onClick={() => removeInvoice(inv)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
