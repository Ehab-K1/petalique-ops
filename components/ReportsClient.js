"use client";

import { downloadCSV } from "./client";

/* Small client helper: one-click CSV export for any report table. */
export default function ExportCSV({ filename, rows, label = "Export CSV" }) {
  if (!rows || rows.length === 0) return null;
  return (
    <button className="btn btn-ghost btn-sm" onClick={() => downloadCSV(filename, rows)}>
      ⬇ {label}
    </button>
  );
}
