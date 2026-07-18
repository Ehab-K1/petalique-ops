"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtDate, money, StatusPill } from "./ui";
import { Modal, Segmented, CopyButton, toast, toastUndo } from "./client";
import OrderForm, { blankOrder, orderToForm } from "./OrderForm";

const DELIVERY_STATUSES = [
  ["pending", "Pending"], ["confirmed", "Confirmed"], ["prepping", "Prepping"],
  ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"], ["cancelled", "Cancelled"],
];
const PICKUP_STATUSES = [
  ["pending", "Pending"], ["confirmed", "Confirmed"], ["prepping", "Prepping"],
  ["ready_for_pickup", "Ready for pickup"], ["picked_up", "Picked up"], ["cancelled", "Cancelled"],
];
const PAYMENTS = [["unpaid", "Unpaid"], ["deposit", "Deposit"], ["paid", "Paid"]];

/* Board columns are fulfillment-neutral; drops map to the right status per order. */
const BOARD_COLS = [
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "prepping", label: "Prepping" },
  { key: "ready", label: "Ready / en route" },
  { key: "done", label: "Completed" },
];
const colOf = (status) => {
  if (["out_for_delivery", "ready_for_pickup"].includes(status)) return "ready";
  if (["delivered", "picked_up"].includes(status)) return "done";
  return status;
};
const statusFor = (colKey, order) => {
  const pickup = (order.fulfillment_type || "delivery") === "pickup";
  if (colKey === "ready") return pickup ? "ready_for_pickup" : "out_for_delivery";
  if (colKey === "done") return pickup ? "picked_up" : "delivered";
  return colKey;
};

export default function OrdersClient({ orders, customers, users }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [presetCustomer, setPresetCustomer] = useState(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState("open"); // open | all | webform | overdue | today | unpaid
  const [layout, setLayout] = useState("list"); // list | board | calendar
  const [fulfilFilter, setFulfilFilter] = useState("all");
  const [dragId, setDragId] = useState(null);
  const [dropCol, setDropCol] = useState(null);
  const [calBase, setCalBase] = useState(() => { const d = new Date(); return [d.getFullYear(), d.getMonth()]; });

  const today = new Date().toISOString().slice(0, 10);
  const [origin, setOrigin] = useState("");

  // Deep-link support: /orders?new=1, ?customer=ID, ?filter=overdue, ?view=board
  useEffect(() => {
    setOrigin(window.location.origin);
    const p = new URLSearchParams(window.location.search);
    if (p.get("new")) setShowForm(true);
    const cid = p.get("customer");
    if (cid) {
      const c = customers.find((x) => String(x.id) === String(cid));
      if (c) { setPresetCustomer(c); setShowForm(true); }
    }
    const f = p.get("filter");
    if (f && ["open", "all", "webform", "overdue", "today", "unpaid"].includes(f)) setView(f);
    const l = p.get("layout");
    if (l && ["list", "board", "calendar"].includes(l)) setLayout(l);
  }, [customers]);

  async function api(method, body, msg) {
    const res = await fetch("/api/orders", {
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

  function removeOrder(o) {
    api("DELETE", { id: o.id }).then((res) => {
      if (res.ok) {
        toastUndo(`Order #${o.id} moved to trash`, async () => {
          await api("PATCH", { id: o.id, restore: true }, "Order restored");
        });
      }
    });
  }

  const filtered = useMemo(() => {
    let list = orders;
    if (view === "open") list = list.filter((o) => !["delivered", "picked_up", "cancelled"].includes(o.status));
    if (view === "webform") list = list.filter((o) => o.source === "webform" && o.status === "pending");
    if (view === "overdue") list = list.filter((o) => String(o.delivery_date).slice(0, 10) < today && !["delivered", "picked_up", "cancelled"].includes(o.status));
    if (view === "today") list = list.filter((o) => String(o.delivery_date).slice(0, 10) === today && !["delivered", "picked_up", "cancelled"].includes(o.status));
    if (view === "unpaid") list = list.filter((o) => o.payment_status !== "paid" && o.status !== "cancelled");
    if (fulfilFilter !== "all") list = list.filter((o) => (o.fulfillment_type || "delivery") === fulfilFilter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((o) =>
        [o.customer_name, o.phone, o.items_desc, o.address, o.notes, o.occasion, o.assigned_name, `#${o.id}`]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
      );
    }
    return list;
  }, [orders, q, view, fulfilFilter, today]);

  /* ---------------- board view ---------------- */
  function onDropTo(colKey) {
    if (dragId == null) return;
    const o = orders.find((x) => x.id === dragId);
    setDragId(null);
    setDropCol(null);
    if (!o) return;
    const next = statusFor(colKey, o);
    if (next !== o.status) api("PATCH", { id: o.id, status: next }, `Moved to ${BOARD_COLS.find((c) => c.key === colKey).label}`);
  }

  const board = (
    <div className="board">
      {BOARD_COLS.map((col) => {
        const cards = filtered.filter((o) => o.status !== "cancelled" && colOf(o.status) === col.key);
        return (
          <div key={col.key}
            className={"board-col" + (dropCol === col.key ? " drop" : "")}
            onDragOver={(e) => { e.preventDefault(); setDropCol(col.key); }}
            onDragLeave={() => setDropCol((c) => (c === col.key ? null : c))}
            onDrop={() => onDropTo(col.key)}>
            <div className="board-col-head">
              {col.label}
              <span className="board-count">{cards.length}</span>
            </div>
            {cards.length === 0 && <div className="board-empty">Drop orders here</div>}
            {cards.map((o) => {
              const d = String(o.delivery_date).slice(0, 10);
              return (
                <Link href={`/orders/${o.id}`} key={o.id}
                  className={"board-card" + (dragId === o.id ? " dragging" : "")}
                  draggable
                  onDragStart={(e) => { setDragId(o.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragId(null); setDropCol(null); }}>
                  <div className="board-card-title">#{o.id} · {o.customer_name}</div>
                  <div className="board-card-sub">
                    {fmtDate(o.delivery_date)}{o.delivery_time ? ` · ${o.delivery_time}` : ""}
                    {Number(o.total) > 0 ? ` · ${money(o.total)}` : ""}
                  </div>
                  <div className="board-card-foot">
                    <span className={"pill " + ((o.fulfillment_type || "delivery") === "pickup" ? "pill-green" : "pill-wine")}>
                      {(o.fulfillment_type || "delivery") === "pickup" ? "Pickup" : "Delivery"}
                    </span>
                    {d < today && col.key !== "done" && <span className="pill pill-rust">Overdue</span>}
                    {d === today && col.key !== "done" && <span className="pill pill-amber">Today</span>}
                    {o.payment_status === "paid"
                      ? <span className="pill pill-green">Paid</span>
                      : o.payment_status === "deposit"
                        ? <span className="pill pill-amber">Deposit</span>
                        : <span className="pill pill-gray">Unpaid</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  /* ---------------- calendar view ---------------- */
  const [calY, calM] = calBase;
  const calendar = (() => {
    const first = new Date(calY, calM, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(calY, calM + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const byDay = {};
    for (const o of filtered) {
      const key = String(o.delivery_date).slice(0, 10);
      (byDay[key] = byDay[key] || []).push(o);
    }
    const monthLabel = first.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
    return (
      <div className="card">
        <div className="cal-head">
          <button className="btn btn-ghost btn-sm" onClick={() => setCalBase(calM === 0 ? [calY - 1, 11] : [calY, calM - 1])}>← Prev</button>
          <div className="cal-month">{monthLabel}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setCalBase(calM === 11 ? [calY + 1, 0] : [calY, calM + 1])}>Next →</button>
        </div>
        <div className="cal-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div className="cal-dow" key={d}>{d}</div>)}
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} className="cal-day dim" />;
            const key = `${calY}-${String(calM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const evts = byDay[key] || [];
            return (
              <div key={key} className={"cal-day" + (key === today ? " today" : "")}>
                <div className="cal-day-num">{d}</div>
                {evts.slice(0, 3).map((o) => {
                  const done = ["delivered", "picked_up", "cancelled"].includes(o.status);
                  const cls = done ? "ev-done" : key < today ? "ev-overdue" : (o.fulfillment_type || "delivery") === "pickup" ? "ev-pickup" : "";
                  return (
                    <Link key={o.id} href={`/orders/${o.id}`} className={"cal-event " + cls}
                      title={`#${o.id} ${o.customer_name}${o.delivery_time ? ` at ${o.delivery_time}` : ""}`}>
                      {o.delivery_time ? `${o.delivery_time.slice(0, 5)} ` : ""}{o.customer_name}
                    </Link>
                  );
                })}
                {evts.length > 3 && <div className="cal-more">+{evts.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  /* ---------------- list view ---------------- */
  const list = (
    <div className="stack stagger">
      {filtered.map((o) => {
        const d = String(o.delivery_date).slice(0, 10);
        const done = ["delivered", "picked_up", "cancelled"].includes(o.status);
        const isOverdue = d < today && !done;
        const isPickup = (o.fulfillment_type || "delivery") === "pickup";
        const statuses = isPickup ? PICKUP_STATUSES : DELIVERY_STATUSES;
        return (
          <div className="card row-link" key={o.id} style={done ? { opacity: 0.65 } : undefined}
            onClick={(e) => {
              if (e.target.closest("select,button,a,input,label")) return;
              router.push(`/orders/${o.id}`);
            }}>
            <div className="row" style={{ borderBottom: "none", padding: 0 }}>
              <div className="row-main">
                <div className="row-title">
                  <Link href={`/orders/${o.id}`} className="link-green">#{o.id}</Link>
                  {" "}
                  {o.customer_id
                    ? <Link href={`/customers/${o.customer_id}`} style={{ fontWeight: 600 }}>{o.customer_name}</Link>
                    : o.customer_name}
                  {Number(o.total) > 0 && <span className="muted"> · {money(o.total)}</span>}
                  {o.source === "webform" && <span className="pill pill-gold" style={{ marginLeft: 6 }}>Web form</span>}
                </div>
                <div className="row-sub">
                  {fmtDate(o.delivery_date)}
                  {o.delivery_time ? ` at ${o.delivery_time}` : ""}
                  {o.phone ? ` · ${o.phone}` : ""}
                  {o.occasion ? ` · ${o.occasion}` : ""}
                  {o.assigned_name ? ` · sold by ${o.assigned_name}` : ""}
                </div>
                {!isPickup && o.address && <div className="row-sub">📍 {o.address}</div>}
                {o.items_desc && <div className="row-sub" style={{ color: "var(--ink)" }}>{o.items_desc}</div>}
                {o.notes && <div className="row-sub">Note: {o.notes}</div>}
              </div>
              <div className="row-side">
                <span className={"pill " + (isPickup ? "pill-green" : "pill-wine")}>
                  {isPickup ? "🏪 Pickup" : "🚗 Delivery"}
                </span>
                {isOverdue && <span className="pill pill-rust pill-pulse">Overdue</span>}
                {d === today && !done && <span className="pill pill-amber">Today</span>}
                <StatusPill status={o.status} />
              </div>
            </div>

            <div className="row-side" style={{ marginTop: 10, justifyContent: "flex-start" }}>
              <select
                className="inline-select"
                value={o.status}
                onChange={(e) => api("PATCH", { id: o.id, status: e.target.value }, "Status updated")}
              >
                {statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select
                className="inline-select"
                value={o.payment_status}
                onChange={(e) => api("PATCH", { id: o.id, payment_status: e.target.value }, "Payment status updated")}
              >
                {PAYMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select
                className="inline-select"
                value={o.assigned_user_id || ""}
                onChange={(e) => api("PATCH", { id: o.id, assigned_user_id: e.target.value || null }, "Assignment updated")}
              >
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <Link href={`/orders/${o.id}`} className="btn btn-ghost btn-sm">Open →</Link>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(o)}>Edit</button>
              <button className="btn-danger btn" onClick={() => removeOrder(o)}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="share-box" style={{ marginBottom: 14 }}>
        <span>🌸</span>
        <code>{origin}/order</code>
        <CopyButton text={`${origin}/order`} label="Copy order form link" small />
      </div>

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input placeholder="Search orders…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented
          options={[["list", "List"], ["board", "Board"], ["calendar", "Calendar"]]}
          value={layout} onChange={setLayout}
        />
        <select className="inline-select" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="open">Open orders</option>
          <option value="all">All orders</option>
          <option value="webform">New web inquiries</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="unpaid">Not fully paid</option>
        </select>
        <select className="inline-select" value={fulfilFilter} onChange={(e) => setFulfilFilter(e.target.value)}>
          <option value="all">Delivery + pickup</option>
          <option value="delivery">Delivery only</option>
          <option value="pickup">Pickup only</option>
        </select>
      </div>

      <button className="btn btn-block" onClick={() => { setShowForm(!showForm); setEditing(null); }} style={{ marginBottom: 14 }}>
        {showForm ? "Close" : "+ New order"}
      </button>

      {showForm && !editing && (
        <div className="card" style={{ marginBottom: 14 }}>
          <OrderForm
            initial={blankOrder(presetCustomer)}
            customers={customers}
            users={users}
            onDone={() => setShowForm(false)}
          />
        </div>
      )}

      {editing && (
        <Modal title={`Edit order #${editing.id} — ${editing.customer_name}`} onClose={() => setEditing(null)}>
          <OrderForm
            initial={orderToForm(editing)}
            editingId={editing.id}
            customers={customers}
            users={users}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}

      {filtered.length === 0 && !showForm && (
        <div className="empty">No orders match. Adjust the filters or add a new one.</div>
      )}

      {layout === "list" && list}
      {layout === "board" && board}
      {layout === "calendar" && calendar}
    </>
  );
}
