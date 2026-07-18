"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const TYPE_ICON = { customer: "👤", order: "🌸", invoice: "🧾", payment: "💵" };
const TYPE_LABEL = { customer: "Customer", order: "Order", invoice: "Invoice", payment: "Payment" };

/* ⌘K global search — customers, orders, invoices and payments in one jump. */
export default function CommandPalette({ onClose }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const d = await res.json();
        setResults(d.results || []);
        setActive(0);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  function go(r) {
    onClose();
    router.push(r.href);
  }

  function onInputKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
  }

  return (
    <div className="palette-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette">
        <div className="palette-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            placeholder="Search customers, orders, invoices, payments…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
          />
          <kbd onClick={onClose} style={{ cursor: "pointer" }}>esc</kbd>
        </div>
        <div className="palette-results">
          {loading && <div className="palette-hint">Searching…</div>}
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <div className="palette-hint">No matches for “{q.trim()}”.</div>
          )}
          {!loading && q.trim().length < 2 && (
            <div className="palette-hint">
              Type a name, phone number, invoice #, or order # — press ↵ to open.
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}`}
              className={"palette-row" + (i === active ? " active" : "")}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
            >
              <span className="palette-icon">{TYPE_ICON[r.type] || "•"}</span>
              <span className="palette-main">
                <span className="palette-title">{r.title}</span>
                <span className="palette-sub">{r.sub}</span>
              </span>
              <span className="palette-type">{TYPE_LABEL[r.type] || r.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
