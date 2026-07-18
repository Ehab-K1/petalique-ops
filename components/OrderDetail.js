"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtDate, fmtDateLong, money, StatusPill } from "./ui";
import { Modal, toast, toastUndo } from "./client";
import OrderForm, { orderToForm } from "./OrderForm";

const DELIVERY_PATH = [
  ["pending", "Pending"], ["confirmed", "Confirmed"], ["prepping", "Prepping"],
  ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"],
];
const PICKUP_PATH = [
  ["pending", "Pending"], ["confirmed", "Confirmed"], ["prepping", "Prepping"],
  ["ready_for_pickup", "Ready for pickup"], ["picked_up", "Picked up"],
];
const METHODS = [["cash", "Cash"], ["e_transfer", "E-transfer"], ["card", "Card"], ["paypal", "PayPal"], ["other", "Other"]];
const methodLabel = (m) => (METHODS.find(([v]) => v === m) || [])[1] || m;

function timeAgo(ts) {
  const t = new Date(ts).getTime();
  if (isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export default function OrderDetail({ order, payments, invoices, activity, customer, customers, users, paid }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const total = Number(order.total) || 0;
  const balance = Math.max(0, total - paid);
  const isPickup = (order.fulfillment_type || "delivery") === "pickup";
  const path = isPickup ? PICKUP_PATH : DELIVERY_PATH;
  const cancelled = order.status === "cancelled";
  const stepIdx = path.findIndex(([v]) => v === order.status);

  const [payForm, setPayForm] = useState({
    amount: "", method: "cash",
    paid_date: new Date().toISOString().slice(0, 10), reference: "", notes: "",
  });

  async function api(method, body, msg) {
    const res = await fetch("/api/orders", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) { router.refresh(); if (msg) toast(msg); }
    else { const d = await res.json().catch(() => ({})); toast(d.error || "Something went wrong", "err"); }
    return res;
  }

  async function setStatus(v) {
    await api("PATCH", { id: order.id, status: v }, `Status: ${path.find(([s]) => s === v)?.[1] || v}`);
  }

  async function recordPayment(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/payments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payForm, order_id: order.id, customer_name: order.customer_name }),
    });
    setSaving(false);
    if (res.ok) {
      toast("Payment recorded");
      setPayOpen(false);
      setPayForm({ ...payForm, amount: "", reference: "", notes: "" });
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast(d.error || "Could not record payment", "err");
    }
  }

  async function createInvoice(kind) {
    const res = await fetch("/api/invoices", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromOrder: order.id, kind }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { toast(`${d.number} created — open it to add line items`); router.refresh(); }
    else toast(d.error || "Could not create the document", "err");
  }

  async function removeOrder() {
    const res = await fetch("/api/orders", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.id }),
    });
    if (res.ok) {
      toastUndo(`Order #${order.id} moved to trash`, async () => {
        await fetch("/api/orders", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: order.id, restore: true }),
        });
        toast("Order restored");
        router.push(`/orders/${order.id}`);
        router.refresh();
      });
      router.push("/orders");
      router.refresh();
    }
  }

  return (
    <>
      <div className="crumbs">
        <Link href="/orders">Orders</Link>
        <span>›</span>
        <span>Order #{order.id}</span>
      </div>

      <div className="detail-head">
        <div>
          <div className="detail-title">
            {order.customer_id
              ? <Link href={`/customers/${order.customer_id}`} className="link-green">{order.customer_name}</Link>
              : order.customer_name}
            {total > 0 && <span className="muted" style={{ fontSize: 19 }}>· {money(total)}</span>}
            <StatusPill status={order.status} />
            {order.source === "webform" && <span className="pill pill-gold">Web form</span>}
            {order.source === "invoice" && <span className="pill pill-gold">From invoice</span>}
          </div>
          <div className="detail-sub">
            {isPickup ? "Pickup" : "Delivery"} · {fmtDateLong(order.delivery_date)}
            {order.delivery_time ? ` at ${order.delivery_time}` : ""}
            {order.occasion ? ` · ${order.occasion}` : ""}
          </div>
        </div>
        <div className="detail-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
          {!cancelled && (
            <button className="btn btn-ghost btn-sm" onClick={() => setStatus("cancelled")}>Cancel order</button>
          )}
          {cancelled && (
            <button className="btn btn-ghost btn-sm" onClick={() => setStatus("pending")}>Reopen order</button>
          )}
          <button className="btn-danger btn" onClick={removeOrder}>Delete</button>
        </div>
      </div>

      {/* status pipeline — click any step to move the order there (backwards too) */}
      <div className="card" style={{ marginBottom: 14 }}>
        {cancelled ? (
          <div className="empty" style={{ padding: 14 }}>
            This order is cancelled. Reopen it to put it back in the pipeline.
          </div>
        ) : (
          <div className="stepper">
            {path.map(([v, l], i) => (
              <button key={v} className={"step" + (i < stepIdx ? " done" : i === stepIdx ? " current" : "")}
                onClick={() => setStatus(v)} title={`Move to ${l}`}>
                <span className="step-dot">{i < stepIdx ? "✓" : i + 1}</span>
                <span className="step-label">{l}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack" style={{ gap: 14 }}>
          {/* order contents */}
          <div className="card">
            <div className="card-title">Order details</div>
            {order.items_desc && <div style={{ fontSize: 14, marginBottom: 8 }}>{order.items_desc}</div>}
            {order.product_types && <div className="row-sub">Products: {order.product_types}{order.quantity ? ` · Qty: ${order.quantity}` : ""}</div>}
            {order.addons && <div className="row-sub">Add-ons: {order.addons}</div>}
            {!isPickup && order.address && <div className="row-sub">Address: {order.address}</div>}
            {order.phone && <div className="row-sub">Phone: {order.phone}{order.preferred_contact ? ` · prefers ${order.preferred_contact}` : ""}</div>}
            {order.email && <div className="row-sub">Email: {order.email}</div>}
            {order.notes && <div className="row-sub" style={{ marginTop: 6 }}>Note: {order.notes}</div>}
            <div className="row-sub" style={{ marginTop: 8 }}>
              Type: {order.order_type} · Added {fmtDate(order.created_at)}
              {order.assigned_name ? ` · sold by ${order.assigned_name}` : ""}
            </div>
            <div className="row-side" style={{ marginTop: 10, justifyContent: "flex-start" }}>
              <select className="inline-select" value={order.assigned_user_id || ""}
                onChange={(e) => api("PATCH", { id: order.id, assigned_user_id: e.target.value || null }, "Assignment updated")}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          {/* money */}
          <div className="card">
            <div className="card-title">
              Payments
              <span className="spacer" />
              {total > 0 && (
                <span className={"balance-chip " + (balance > 0 ? "due" : "clear")}>
                  {balance > 0 ? `${money(balance)} outstanding` : "Fully paid ✓"}
                </span>
              )}
            </div>
            {total > 0 && (
              <div className="pay-progress" style={{ marginBottom: 12 }}>
                <div className="pay-progress-track">
                  <div className="pay-progress-fill" style={{ width: `${Math.min(100, (paid / total) * 100)}%` }} />
                </div>
                <div className="pay-progress-labels">
                  <span>{money(paid)} collected</span>
                  <span>of {money(total)}</span>
                </div>
              </div>
            )}
            {payments.length === 0 && <div className="empty" style={{ padding: "10px 0" }}>No payments recorded yet.</div>}
            {payments.map((p) => (
              <div className="row" key={p.id}>
                <div className="row-main">
                  <div className="row-title">{money(p.amount)} · {methodLabel(p.method)}</div>
                  <div className="row-sub">
                    {fmtDate(p.paid_date)}
                    {p.invoice_number ? ` · via ${p.invoice_number}` : ""}
                    {p.reference ? ` · ref ${p.reference}` : ""}
                  </div>
                </div>
                <div className="row-side"><span className="pill pill-green">Received</span></div>
              </div>
            ))}
            {payOpen ? (
              <form className="stack" style={{ marginTop: 10 }} onSubmit={recordPayment}>
                <div className="form-grid-2">
                  <label className="field">
                    <span>Amount {balance > 0 ? `(balance ${money(balance)})` : ""}</span>
                    <input type="number" step="0.01" min="0.01" required autoFocus
                      value={payForm.amount}
                      onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                      placeholder={balance > 0 ? String(balance.toFixed(2)) : "0.00"} />
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
                <div className="row-side" style={{ justifyContent: "flex-start" }}>
                  <button className="btn btn-sm" type="submit" disabled={saving}>{saving ? "Saving…" : "Save payment"}</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPayOpen(false)}>Cancel</button>
                  {balance > 0 && (
                    <button className="btn btn-ghost btn-sm" type="button"
                      onClick={() => setPayForm({ ...payForm, amount: balance.toFixed(2) })}>
                      Fill balance
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setPayOpen(true)}>
                + Record payment
              </button>
            )}
          </div>

          {/* history */}
          <div className="card">
            <div className="card-title">Activity</div>
            {activity.length === 0 ? (
              <div className="empty" style={{ padding: "10px 0" }}>No activity logged yet.</div>
            ) : (
              <div className="timeline">
                {activity.map((a) => (
                  <div className="tl-item" key={a.id}>
                    <div className="tl-text"><strong>{a.user_name || "System"}</strong> {a.summary}</div>
                    <div className="tl-time">{timeAgo(a.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          {/* customer 360 link */}
          <div className="card">
            <div className="card-title">Customer</div>
            {customer ? (
              <>
                <div className="row-title">
                  <Link href={`/customers/${customer.id}`} className="link-green">{customer.name}</Link>
                  {customer.company ? <span className="muted"> · {customer.company}</span> : null}
                </div>
                <div className="row-sub">{[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact info"}</div>
                <div className="row-sub" style={{ marginTop: 4 }}>
                  {customer.order_count} order{customer.order_count === 1 ? "" : "s"} · {money(customer.lifetime)} lifetime
                </div>
                <Link href={`/customers/${customer.id}`} className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>
                  View full history →
                </Link>
              </>
            ) : (
              <div className="empty" style={{ padding: "10px 0" }}>
                Not linked to a customer record. Edit the order and pick or re-save the customer to link it.
              </div>
            )}
          </div>

          {/* documents */}
          <div className="card">
            <div className="card-title">Invoices & quotes</div>
            {invoices.length === 0 && (
              <div className="empty" style={{ padding: "10px 0" }}>No documents for this order yet.</div>
            )}
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
            <div className="row-side" style={{ marginTop: 10, justifyContent: "flex-start" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => createInvoice("invoice")}>+ Invoice from order</button>
              <button className="btn btn-ghost btn-sm" onClick={() => createInvoice("quote")}>+ Quote from order</button>
            </div>
          </div>

          {/* payment status quick set */}
          <div className="card">
            <div className="card-title">Payment status</div>
            <div className="row-sub" style={{ marginBottom: 8 }}>
              Set automatically when payments are recorded — override here if needed.
            </div>
            <select className="inline-select" value={order.payment_status}
              onChange={(e) => api("PATCH", { id: order.id, payment_status: e.target.value }, "Payment status updated")}>
              <option value="unpaid">Unpaid</option>
              <option value="deposit">Deposit</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
      </div>

      {editing && (
        <Modal title={`Edit order #${order.id}`} onClose={() => setEditing(false)}>
          <OrderForm
            initial={orderToForm(order)}
            editingId={order.id}
            customers={customers}
            users={users}
            onDone={() => setEditing(false)}
          />
        </Modal>
      )}
    </>
  );
}
