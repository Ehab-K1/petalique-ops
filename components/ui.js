export function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(String(d).slice(0, 10) + "T00:00:00");
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function money(n) {
  const v = Number(n || 0);
  return "$" + v.toFixed(2);
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
  prepping: "pill-amber",
  confirmed: "pill-amber",
  pending: "pill-gray",
};

const STATUS_LABEL = {
  pending: "Pending",
  confirmed: "Confirmed",
  prepping: "Prepping",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
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
