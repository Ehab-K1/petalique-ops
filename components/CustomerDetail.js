"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtDate, money, StatusPill } from "./ui";
import { Modal, toast, toastUndo, CountUp, Tilt } from "./client";

const TYPES = [
  ["retail", "Retail"], ["planner", "Event planner"], ["venue", "Venue"],
  ["corporate", "Corporate"], ["wholesale", "Wholesale"],
];

export default function CustomerDetail({ customer, orders, invoices, payments, activity, allCustomers, stats, isAdmin }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeFrom, setMergeFrom] = useState("");
  const [form, setForm] = useState({
    name: customer.name || "", phone: customer.phone || "", email: customer.email || "",
    type: customer.type || "retail", company: customer.company || "", notes: customer.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function api(body, msg) {
    const res = await fetch("/api/customers", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, id: customer.id }),
    });
    if (res.ok) { router.refresh(); if (msg) toast(msg); }
    return res;
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await api({ ...form, edit: true }, "Customer updated");
    setSaving(false);
    if (res.ok) setEditing(false);
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not save.");
    }
  }

  async function doMerge(e) {
    e.preventDefault();
    if (!mergeFrom) return;
    const res = await api({ merge_from: mergeFrom }, "Customers merged — all history moved here");
    if (res.ok) setMerging(false);
    else {
      const d = await res.json().catch(() => ({}));
      toast(d.error || "Merge failed", "err");
    }
  }

  async function removeCustomer() {
    const res = await fetch("/api/customers", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: customer.id }),
    });
    if (res.ok) {
      toastUndo(`${customer.name} moved to trash`, async () => {
        await fetch("/api/customers", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: customer.id, restore: true }),
        });
        toast("Customer restored");
        router.refresh();
      });
      router.push("/customers");
      router.refresh();
    }
  }

  return (
    <>
      <div className="crumbs">
        <Link href="/customers">Customers</Link>
        <span>›</span>
        <span>{customer.name}</span>
      </div>

      <div className="detail-head">
        <div>
          <div className="detail-title">
            {customer.name}
            <span className="pill pill-green" style={{ textTransform: "capitalize" }}>{customer.type}</span>
            {customer.company && <span className="muted" style={{ fontSize: 16 }}>· {customer.company}</span>}
          </div>
          <div className="detail-sub">
            {[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact info yet"}
            {stats.firstOrder ? ` · customer since ${fmtDate(stats.firstOrder)}` : ""}
          </div>
        </div>
        <div className="detail-actions">
          <Link href={`/orders?new=1&customer=${customer.id}`} className="btn btn-sm">+ New order</Link>
          <Link href={`/invoices?new=1&customer=${customer.id}`} className="btn btn-ghost btn-sm">+ Invoice</Link>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>✏️ Edit</button>
          {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => setMerging(true)}>Merge duplicate</button>}
          <button className="btn-danger btn" onClick={removeCustomer}>Delete</button>
        </div>
      </div>

      <div className="grid grid-4 stagger" style={{ marginBottom: 16 }}>
        <Tilt className="card stat">
          <div className="stat-value"><CountUp value={stats.lifetime} money /></div>
          <div className="stat-label">Lifetime value (completed orders)</div>
        </Tilt>
        <Tilt className="card stat">
          <div className="stat-value"><CountUp value={stats.orderCount} /></div>
          <div className="stat-label">Orders ({stats.openCount} open)</div>
        </Tilt>
        <Tilt className="card stat">
          <div className="stat-value"><CountUp value={stats.avgOrder} money /></div>
          <div className="stat-label">Average order</div>
        </Tilt>
        <Tilt className="card stat">
          <div className="stat-value"><CountUp value={stats.totalPaid} money /></div>
          <div className="stat-label">Total collected</div>
        </Tilt>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack" style={{ gap: 14 }}>
          <div className="card">
            <div className="card-title">Orders</div>
            {orders.length === 0 && <div className="empty" style={{ padding: "10px 0" }}>No orders yet — start one with “+ New order”.</div>}
            {orders.map((o) => (
              <Link href={`/orders/${o.id}`} className="row row-link" key={o.id} style={{ display: "flex" }}>
                <div className="row-main">
                  <div className="row-title">#{o.id} · {fmtDate(o.delivery_date)}{Number(o.total) > 0 ? ` · ${money(o.total)}` : ""}</div>
                  <div className="row-sub">
                    {(o.fulfillment_type || "delivery") === "pickup" ? "Pickup" : "Delivery"}
                    {o.items_desc ? ` · ${o.items_desc.slice(0, 70)}${o.items_desc.length > 70 ? "…" : ""}` : ""}
                  </div>
                </div>
                <div className="row-side">
                  {o.payment_status === "paid" && <span className="pill pill-green">Paid</span>}
                  {o.payment_status === "deposit" && <span className="pill pill-amber">Deposit</span>}
                  <StatusPill status={o.status} />
                </div>
              </Link>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Payments</div>
            {payments.length === 0 && <div className="empty" style={{ padding: "10px 0" }}>No payments recorded.</div>}
            {payments.slice(0, 12).map((p) => (
              <div className="row" key={p.id}>
                <div className="row-main">
                  <div className="row-title">{money(p.amount)}</div>
                  <div className="row-sub">
                    {fmtDate(p.paid_date)} · {p.method}
                    {p.order_id ? ` · order #${p.order_id}` : ""}
                    {p.invoice_number ? ` · ${p.invoice_number}` : ""}
                  </div>
                </div>
                {p.order_id && (
                  <div className="row-side">
                    <Link href={`/orders/${p.order_id}`} className="btn btn-ghost btn-sm">View order</Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          <div className="card">
            <div className="card-title">Invoices & quotes</div>
            {invoices.length === 0 && <div className="empty" style={{ padding: "10px 0" }}>No documents yet.</div>}
            {invoices.map((inv) => (
              <div className="row" key={inv.id}>
                <div className="row-main">
                  <div className="row-title">{inv.number}</div>
                  <div className="row-sub">{inv.kind === "quote" ? "Quotation" : "Invoice"} · {money(inv.computed_total)} · {inv.status}</div>
                </div>
                <div className="row-side">
                  <a className="btn btn-ghost btn-sm" href={`/i/${inv.token}`} target="_blank" rel="noreferrer">View</a>
                  <Link className="btn btn-ghost btn-sm" href={`/invoices?open=${inv.id}`}>Edit</Link>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">
              Notes
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
            </div>
            {customer.notes
              ? <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{customer.notes}</div>
              : <div className="empty" style={{ padding: "10px 0" }}>Preferences, allergies, referral source, key dates…</div>}
          </div>

          {activity.length > 0 && (
            <div className="card">
              <div className="card-title">History</div>
              <div className="timeline">
                {activity.map((a) => (
                  <div className="tl-item" key={a.id}>
                    <div className="tl-text"><strong>{a.user_name || "System"}</strong> {a.summary}</div>
                    <div className="tl-time">{fmtDate(a.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <Modal title={`Edit — ${customer.name}`} onClose={() => setEditing(false)}>
          <form className="stack" onSubmit={saveEdit}>
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
                <span>Phone</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Company or venue</span>
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            {error && <div className="error-text">{error}</div>}
            <button className="btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </form>
        </Modal>
      )}

      {merging && (
        <Modal title="Merge a duplicate into this customer" onClose={() => setMerging(false)}>
          <form className="stack" onSubmit={doMerge}>
            <p className="muted">
              Pick the duplicate record. All of its orders, invoices and payments move to{" "}
              <strong>{customer.name}</strong>, and the duplicate goes to the trash. This fixes
              double-entries without losing any history.
            </p>
            <label className="field">
              <span>Duplicate customer</span>
              <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} required>
                <option value="">Choose…</option>
                {allCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button className="btn" type="submit" disabled={!mergeFrom}>Merge into {customer.name}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
