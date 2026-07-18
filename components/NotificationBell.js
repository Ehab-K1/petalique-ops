"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconFlower, IconClock, IconAlert, IconFile, IconLeaf } from "./icons";

const KIND_ICON = {
  inquiry: IconFlower, today: IconClock, overdue: IconAlert, invoice: IconFile, stock: IconLeaf,
};

/* Live attention feed — new inquiries, deliveries due, overdue invoices, aging stock. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ count: 0, items: [] });
  const timer = useRef(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) setData(await res.json());
    } catch { /* offline — keep last state */ }
  }

  useEffect(() => {
    load();
    timer.current = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <div className="bell-wrap">
      <button className={"bell-btn" + (data.count > 0 ? " has" : "")} onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {data.count > 0 && <span className="bell-badge">{data.count > 9 ? "9+" : data.count}</span>}
      </button>
      {open && (
        <>
          <div className="menu-overlay" onMouseDown={() => setOpen(false)} />
          <div className="menu-panel bell-panel">
            <div className="bell-head">
              Needs attention
              <span className="muted" style={{ fontSize: 12 }}>{data.count} item{data.count === 1 ? "" : "s"}</span>
            </div>
            {data.items.length === 0 ? (
              <div className="palette-hint">All clear — nothing needs your attention right now.</div>
            ) : (
              data.items.map((n, i) => {
                const Ic = KIND_ICON[n.kind] || IconClock;
                return (
                  <Link key={i} href={n.href} className="menu-item bell-item" onClick={() => setOpen(false)}>
                    <span className={"menu-icon bell-kind bell-kind-" + n.kind}><Ic size={14} /></span>
                    <span className="bell-item-main">
                      <span className="bell-item-title">{n.title}</span>
                      <span className="bell-item-sub">{n.sub}</span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
