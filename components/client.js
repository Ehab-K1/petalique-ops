"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ---------- toast system ---------- */
export function toast(message, type = "ok") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pf-toast", { detail: { message, type } }));
  }
}

/* Toast with an Undo button — used after every delete so mistakes cost one click. */
export function toastUndo(message, onUndo) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pf-toast", {
      detail: { message, type: "ok", actionLabel: "Undo", onAction: onUndo, ttl: 6000 },
    }));
  }
}

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    function onToast(e) {
      const id = Math.random().toString(36).slice(2);
      const ttl = e.detail.ttl || 2400;
      setItems((prev) => [...prev.slice(-2), { id, ...e.detail, out: false }]);
      setTimeout(() => {
        setItems((prev) => prev.map((t) => (t.id === id ? { ...t, out: true } : t)));
      }, ttl);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, ttl + 350);
    }
    window.addEventListener("pf-toast", onToast);
    return () => window.removeEventListener("pf-toast", onToast);
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="toast-stack">
      {items.map((t) => (
        <div key={t.id} className={"toast" + (t.type === "err" ? " toast-err" : "") + (t.out ? " out" : "")}>
          {t.type === "err" ? "⚠" : "✓"} {t.message}
          {t.actionLabel && (
            <button
              className="toast-action"
              onClick={() => {
                t.onAction?.();
                setItems((prev) => prev.filter((x) => x.id !== t.id));
              }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- CSV export (reports, lists) ---------- */
export function downloadCSV(filename, rows) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- animated number ---------- */
export function CountUp({ value, money: isMoney = false, duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const target = Number(value) || 0;
  useEffect(() => {
    let raf;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  if (isMoney) {
    return <>{"$" + display.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>;
  }
  return <>{Math.round(display).toLocaleString("en-CA")}</>;
}

/* ---------- 3D tilt wrapper ---------- */
export function Tilt({ children, max = 7, className, style }) {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${px * max}deg) rotateX(${-py * max}deg) translateY(-3px)`;
  }, [max]);
  const onLeave = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = "";
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{ transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)", willChange: "transform", ...style }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
    </div>
  );
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- copy-to-clipboard button ---------- */
export function CopyButton({ text, label = "Copy link", small = false }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("Link copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Could not copy — long-press the link instead", "err");
    }
  }
  return (
    <button className={"btn btn-ghost" + (small ? " btn-sm" : "")} type="button" onClick={copy}>
      {copied ? "Copied ✓" : label}
    </button>
  );
}

/* ---------- segmented control ---------- */
export function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} type="button" className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/* ---------- print button (for invoice/quote PDF export) ---------- */
export function PrintButton({ label = "Download PDF / Print" }) {
  return (
    <button className="btn" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}

/* ---------- floating petals (login + public form ambience) ---------- */
const PETALS = [
  { left: "8%", size: 26, delay: 0, dur: 14, color: "#e9d3da" },
  { left: "22%", size: 16, delay: 3, dur: 18, color: "#dce7d4" },
  { left: "38%", size: 20, delay: 7, dur: 16, color: "#f2e8d5" },
  { left: "56%", size: 14, delay: 1.5, dur: 20, color: "#e9d3da" },
  { left: "71%", size: 24, delay: 5, dur: 15, color: "#dce7d4" },
  { left: "86%", size: 18, delay: 9, dur: 19, color: "#f1e6e9" },
];

export function Petals() {
  return (
    <>
      {PETALS.map((p, i) => (
        <span
          key={i}
          className="petal"
          style={{
            left: p.left,
            top: "-40px",
            width: p.size,
            height: p.size * 1.25,
            background: p.color,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </>
  );
}
