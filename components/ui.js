export function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(String(d).slice(0, 10) + "T00:00:00");
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function fmtDateLong(d) {
  if (!d) return "—";
  const date = new Date(String(d).slice(0, 10) + "T00:00:00");
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

export function money(n) {
  const v = Number(n || 0);
  return "$" + v.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function daysSince(d) {
  if (!d) return 0;
  const ms = Date.now() - new Date(String(d).slice(0, 10) + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

const STATUS_STYLE = {
  delivered: "pill-green",
  cancelled: "pill-rust",
  out_for_delivery: "pill-wine",
  ready_for_pickup: "pill-wine",
  picked_up: "pill-green",
  prepping: "pill-amber",
  confirmed: "pill-amber",
  pending: "pill-gray",
};

const STATUS_LABEL = {
  pending: "Pending",
  confirmed: "Confirmed",
  prepping: "Prepping",
  out_for_delivery: "Out for delivery",
  ready_for_pickup: "Ready for pickup",
  delivered: "Delivered",
  picked_up: "Picked up",
  cancelled: "Cancelled",
};

export function StatusPill({ status }) {
  return (
    <span className={"pill " + (STATUS_STYLE[status] || "pill-gray")}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function FreshMeter({ intakeDate }) {
  const days = daysSince(intakeDate);
  let color = "#2f4a3c";
  let label = "Fresh";
  let dots = 5;
  if (days > 7) { color = "#a8462b"; label = "Aging fast"; dots = 1; }
  else if (days > 5) { color = "#b4802a"; label = "Use soon"; dots = 2; }
  else if (days > 3) { color = "#b4802a"; label = "Good"; dots = 3; }
  return (
    <span className="fresh-meter" title={`${days} days since intake`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="fresh-dot"
          style={{ background: i < dots ? color : "#dee3d4" }}
        />
      ))}
      <span style={{ fontSize: 12, fontWeight: 550, color, marginLeft: 4 }}>
        {label} · {days}d
      </span>
    </span>
  );
}

/* Petalique flower mark — used in nav, login, invoices, public form */
export function BloomMark({ size = 26, light = false }) {
  const petal = light ? "#ffffff" : "#2f4a3c";
  const heart = light ? "#e7cfa0" : "#c9a45c";
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="brand-mark" aria-hidden="true">
      {[0, 72, 144, 216, 288].map((r) => (
        <ellipse
          key={r}
          cx="24" cy="13" rx="7.5" ry="11"
          fill={petal} opacity={light ? 0.92 : 0.88}
          transform={`rotate(${r} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="5.5" fill={heart} />
    </svg>
  );
}

/* ---- dependency-free SVG charts (server-rendered) ---- */

export function BarChart({ data, height = 150, prefix = "$" }) {
  // data: [{ label, value }]
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length || 1;
  const W = 600;
  const gap = 8;
  const bw = (W - gap * (n - 1)) / n;
  return (
    <svg viewBox={`0 0 ${W} ${height + 34}`} className="chart-bars" role="img">
      <defs>
        <linearGradient id="pf-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3e6450" />
          <stop offset="100%" stopColor="#2f4a3c" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const h = Math.max(2, (d.value / max) * height);
        const x = i * (bw + gap);
        return (
          <g key={i}>
            <title>{`${d.label}: ${prefix}${Number(d.value).toLocaleString("en-CA", { maximumFractionDigits: 0 })}`}</title>
            <rect
              className="bar"
              x={x} y={height - h} width={bw} height={h}
              rx={Math.min(6, bw / 3)}
              fill={i === n - 1 ? "url(#pf-bar)" : "#cdd9c6"}
              style={{ animationDelay: `${i * 0.05}s` }}
            />
            <text
              x={x + bw / 2} y={height + 16}
              textAnchor="middle" fontSize="11" fill="#5b6357"
            >
              {d.label}
            </text>
            {d.value > 0 && h > 24 && (
              <text
                x={x + bw / 2} y={height - h + 15}
                textAnchor="middle" fontSize="10.5" fontWeight="600"
                fill={i === n - 1 ? "#fff" : "#5b6357"}
              >
                {prefix}{Math.round(d.value) >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : Math.round(d.value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function RevExpChart({ data, height = 150 }) {
  // data: [{ label, rev, exp }] — paired bars, green = revenue, wine = expenses
  const max = Math.max(1, ...data.flatMap((d) => [d.rev, d.exp]));
  const n = data.length || 1;
  const W = 600;
  const groupGap = 10;
  const gw = (W - groupGap * (n - 1)) / n;
  const bw = Math.max(4, (gw - 3) / 2);
  return (
    <svg viewBox={`0 0 ${W} ${height + 34}`} className="chart-bars" role="img">
      {data.map((d, i) => {
        const x = i * (gw + groupGap);
        const hr = Math.max(2, (d.rev / max) * height);
        const he = Math.max(2, (d.exp / max) * height);
        const profit = d.rev - d.exp;
        return (
          <g key={i}>
            <title>{`${d.label} — revenue $${Math.round(d.rev).toLocaleString("en-CA")}, expenses $${Math.round(d.exp).toLocaleString("en-CA")}, profit $${Math.round(profit).toLocaleString("en-CA")}`}</title>
            <rect className="bar" x={x} y={height - hr} width={bw} height={hr}
              rx={Math.min(4, bw / 3)} fill="#2f4a3c"
              style={{ animationDelay: `${i * 0.05}s` }} />
            <rect className="bar" x={x + bw + 3} y={height - he} width={bw} height={he}
              rx={Math.min(4, bw / 3)} fill="#c58ba0"
              style={{ animationDelay: `${i * 0.05 + 0.03}s` }} />
            <text x={x + gw / 2} y={height + 16} textAnchor="middle" fontSize="11" fill="#5b6357">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const DONUT_COLORS = ["#2f4a3c", "#c9a45c", "#6b3f4e", "#b4802a", "#8ba084", "#a8462b"];

export function Donut({ data, size = 132 }) {
  // data: [{ label, value }]
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 42;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 110 110" width={size} height={size} className="donut-ring">
        <circle cx="55" cy="55" r={R} fill="none" stroke="#eef0ea" strokeWidth="15" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = `${frac * C} ${C}`;
          const offset = -acc * C;
          acc += frac;
          if (d.value === 0) return null;
          return (
            <circle
              key={i}
              cx="55" cy="55" r={R} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="15"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              transform="rotate(-90 55 55)"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
        })}
        <text x="55" y="52" textAnchor="middle" fontSize="17" fontWeight="700" fill="#20281f">
          {data.reduce((s, d) => s + d.value, 0)}
        </text>
        <text x="55" y="66" textAnchor="middle" fontSize="8.5" fill="#5b6357">
          total
        </text>
      </svg>
      <div className="legend">
        {data.map((d, i) => (
          <div className="legend-item" key={i}>
            <span className="dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length], marginRight: 0 }} />
            <span>{d.label}</span>
            <strong style={{ marginLeft: "auto", paddingLeft: 10 }}>{d.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Leaderboard({ rows, valueKey = "value", labelKey = "label", fmt = money }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 99, flexShrink: 0,
            background: i === 0 ? "#f6edda" : "#eef0ea",
            color: i === 0 ? "#8c6a1f" : "#5b6357",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 11.5, fontWeight: 700,
          }}>
            {i + 1}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 550, minWidth: 90 }}>{r[labelKey]}</span>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${((Number(r[valueKey]) || 0) / max) * 100}%`,
                animationDelay: `${i * 0.08}s`,
                background: i === 0
                  ? "linear-gradient(90deg, #d9b878, #c9a45c)"
                  : undefined,
              }}
            />
          </div>
          <strong style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {fmt(r[valueKey])}
          </strong>
        </div>
      ))}
    </div>
  );
}
