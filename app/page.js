import Nav from "@/components/Nav";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatusPill, FreshMeter, fmtDate, money, RevExpChart, Donut, Leaderboard } from "@/components/ui";
import { CountUp, Tilt } from "@/components/client";

export const dynamic = "force-dynamic";

function deltaBadge(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={"stat-delta " + (up ? "delta-up" : "delta-down")}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% vs last month
    </span>
  );
}

export default async function Dashboard() {
  const user = await requireUser();
  const sql = await db();

  const upcoming = await sql`
    SELECT o.*, u.name AS assigned_name FROM orders o
    LEFT JOIN users u ON u.id = o.assigned_user_id
    WHERE o.status NOT IN ('delivered','picked_up','cancelled')
    ORDER BY o.delivery_date ASC, o.delivery_time ASC
    LIMIT 10`;

  const overdue = await sql`
    SELECT COUNT(*)::int AS c FROM orders
    WHERE delivery_date < CURRENT_DATE AND status NOT IN ('delivered','picked_up','cancelled')`;

  const dueToday = await sql`
    SELECT COUNT(*)::int AS c FROM orders
    WHERE delivery_date = CURRENT_DATE AND status NOT IN ('delivered','picked_up','cancelled')`;

  const aging = await sql`
    SELECT COUNT(*)::int AS c FROM inventory_batches
    WHERE status = 'available' AND intake_date <= CURRENT_DATE - 7`;

  const newInquiries = await sql`
    SELECT COUNT(*)::int AS c FROM orders
    WHERE source = 'webform' AND status = 'pending'`;

  const thisMonth = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS rev, COUNT(*)::int AS c
    FROM orders
    WHERE status IN ('delivered','picked_up') AND delivery_date >= date_trunc('month', CURRENT_DATE)`;

  const lastMonth = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS rev, COUNT(*)::int AS c
    FROM orders
    WHERE status IN ('delivered','picked_up')
      AND delivery_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
      AND delivery_date < date_trunc('month', CURRENT_DATE)`;

  const thisYear = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS rev, COUNT(*)::int AS c
    FROM orders
    WHERE status IN ('delivered','picked_up') AND delivery_date >= date_trunc('year', CURRENT_DATE)`;

  const unpaid = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS rev, COUNT(*)::int AS c
    FROM orders
    WHERE payment_status <> 'paid' AND status <> 'cancelled'`;

  const monthly = await sql`
    SELECT to_char(date_trunc('month', delivery_date), 'YYYY-MM') AS m,
           SUM(total)::numeric AS rev
    FROM orders
    WHERE status IN ('delivered','picked_up')
      AND delivery_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
    GROUP BY 1 ORDER BY 1`;

  const monthlyExp = await sql`
    SELECT to_char(date_trunc('month', expense_date), 'YYYY-MM') AS m,
           SUM(amount)::numeric AS s
    FROM expenses
    WHERE expense_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
    GROUP BY 1 ORDER BY 1`;

  const expThisMonth = await sql`
    SELECT COALESCE(SUM(amount),0)::numeric AS s FROM expenses
    WHERE expense_date >= date_trunc('month', CURRENT_DATE)`;

  const expLastMonth = await sql`
    SELECT COALESCE(SUM(amount),0)::numeric AS s FROM expenses
    WHERE expense_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
      AND expense_date < date_trunc('month', CURRENT_DATE)`;

  const expThisYear = await sql`
    SELECT COALESCE(SUM(amount),0)::numeric AS s FROM expenses
    WHERE expense_date >= date_trunc('year', CURRENT_DATE)`;

  const team = await sql`
    SELECT u.name, COALESCE(SUM(o.total),0)::numeric AS rev, COUNT(o.id)::int AS c
    FROM users u
    LEFT JOIN orders o ON o.assigned_user_id = u.id
      AND o.status <> 'cancelled'
      AND o.delivery_date >= date_trunc('month', CURRENT_DATE)
    GROUP BY u.id, u.name
    ORDER BY rev DESC
    LIMIT 6`;

  const fulfillment = await sql`
    SELECT fulfillment_type, COUNT(*)::int AS c
    FROM orders
    WHERE status <> 'cancelled' AND delivery_date >= date_trunc('month', CURRENT_DATE)
    GROUP BY fulfillment_type`;

  const topCustomers = await sql`
    SELECT customer_name, SUM(total)::numeric AS rev
    FROM orders
    WHERE status IN ('delivered','picked_up')
    GROUP BY customer_name
    ORDER BY rev DESC
    LIMIT 5`;

  const stock = await sql`
    SELECT variety, SUM(quantity)::int AS qty, MIN(intake_date) AS oldest
    FROM inventory_batches
    WHERE status = 'available' AND quantity > 0
    GROUP BY variety
    ORDER BY MIN(intake_date) ASC
    LIMIT 8`;

  // build a full 12-month series (fill gaps with 0)
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const series = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const hit = monthly.find((r) => r.m === key);
    const hitE = monthlyExp.find((r) => r.m === key);
    series.push({
      label: MONTH_LABELS[d.getMonth()],
      rev: Number(hit?.rev || 0),
      exp: Number(hitE?.s || 0),
    });
  }

  const profitThisMonth = Number(thisMonth[0].rev) - Number(expThisMonth[0].s);
  const profitLastMonth = Number(lastMonth[0].rev) - Number(expLastMonth[0].s);
  const profitYear = Number(thisYear[0].rev) - Number(expThisYear[0].s);
  const marginPct = Number(thisMonth[0].rev) > 0 ? (profitThisMonth / Number(thisMonth[0].rev)) * 100 : null;

  const fulfillmentData = [
    { label: "Delivery", value: Number(fulfillment.find((f) => f.fulfillment_type === "delivery")?.c || 0) },
    { label: "Pickup", value: Number(fulfillment.find((f) => f.fulfillment_type === "pickup")?.c || 0) },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const hasAlerts = overdue[0].c > 0 || dueToday[0].c > 0 || aging[0].c > 0;
  const avgOrder = thisMonth[0].c > 0 ? Number(thisMonth[0].rev) / thisMonth[0].c : 0;

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {user.name.split(" ")[0]}</div>
        <div className="page-sub">Here&apos;s how the studio is doing.</div>

        {newInquiries[0].c > 0 && (
          <div className="alert alert-info">
            <div className="alert-title">🌸 New order inquiries</div>
            <p>
              {newInquiries[0].c} new request{newInquiries[0].c === 1 ? "" : "s"} came in through your order form.{" "}
              <Link href="/orders" style={{ textDecoration: "underline", fontWeight: 600 }}>Review them →</Link>
            </p>
          </div>
        )}

        {hasAlerts && (
          <div className="alert">
            <div className="alert-title">Needs attention</div>
            {overdue[0].c > 0 && <p>{overdue[0].c} order{overdue[0].c === 1 ? " is" : "s are"} past due.</p>}
            {dueToday[0].c > 0 && <p>{dueToday[0].c} due today.</p>}
            {aging[0].c > 0 && <p>{aging[0].c} stem batch{aging[0].c === 1 ? "" : "es"} at 7+ days old. Use or discount now.</p>}
          </div>
        )}

        <div className="grid grid-4 stagger" style={{ marginBottom: 16 }}>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={thisMonth[0].rev} money /></div>
            <div className="stat-label">
              Revenue this month ({thisMonth[0].c} orders)
              {deltaBadge(thisMonth[0].rev, lastMonth[0].rev)}
            </div>
          </Tilt>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={lastMonth[0].rev} money /></div>
            <div className="stat-label">Last month ({lastMonth[0].c} orders)</div>
          </Tilt>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={thisYear[0].rev} money /></div>
            <div className="stat-label">This year ({thisYear[0].c} orders)</div>
          </Tilt>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={unpaid[0].rev} money /></div>
            <div className="stat-label">Outstanding, unpaid ({unpaid[0].c} orders)</div>
          </Tilt>
        </div>

        <div className="grid grid-3 stagger" style={{ marginBottom: 16 }}>
          <Tilt className="card stat">
            <div className="stat-value" style={{ color: profitThisMonth >= 0 ? "var(--green-bright)" : "var(--rust)" }}>
              <CountUp value={profitThisMonth} money />
            </div>
            <div className="stat-label">
              Profit this month{marginPct != null ? ` · ${marginPct.toFixed(0)}% margin` : ""}
              {deltaBadge(profitThisMonth, profitLastMonth)}
            </div>
          </Tilt>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={expThisMonth[0].s} money /></div>
            <div className="stat-label">
              Expenses this month
              <Link href="/expenses" style={{ marginLeft: 8, fontSize: 12, textDecoration: "underline" }}>details →</Link>
            </div>
          </Tilt>
          <Tilt className="card stat">
            <div className="stat-value" style={{ color: profitYear >= 0 ? "var(--green-bright)" : "var(--rust)" }}>
              <CountUp value={profitYear} money />
            </div>
            <div className="stat-label">Profit this year</div>
          </Tilt>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">
            Revenue vs expenses, last 12 months
            <span className="spacer" />
            <span className="legend-item" style={{ fontSize: 12 }}>
              <span className="dot" style={{ background: "#2f4a3c", marginRight: 4 }} />revenue
              <span className="dot" style={{ background: "#c58ba0", margin: "0 4px 0 10px" }} />expenses
            </span>
          </div>
          <RevExpChart data={series} />
          <div className="muted" style={{ marginTop: 4 }}>avg order this month: {money(avgOrder)}</div>
        </div>

        <div className="grid grid-2 stagger" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-title">Team sales this month</div>
            {team.every((t) => Number(t.rev) === 0) ? (
              <div className="empty">No assigned sales yet this month. Assign orders to team members from the Orders page.</div>
            ) : (
              <Leaderboard rows={team.map((t) => ({ label: t.name, value: Number(t.rev) }))} />
            )}
          </div>
          <div className="card">
            <div className="card-title">Delivery vs pickup, this month</div>
            {fulfillmentData.every((f) => f.value === 0) ? (
              <div className="empty">No orders yet this month.</div>
            ) : (
              <Donut data={fulfillmentData} />
            )}
          </div>
        </div>

        <div className="grid grid-2 stagger">
          <div className="card">
            <div className="card-title">Upcoming orders</div>
            {upcoming.length === 0 ? (
              <div className="empty">Nothing scheduled. Add orders from the Orders tab.</div>
            ) : (
              upcoming.map((o) => {
                const d = String(o.delivery_date).slice(0, 10);
                return (
                  <div className="row" key={o.id}>
                    <div className="row-main">
                      <div className="row-title">{o.customer_name}</div>
                      <div className="row-sub">
                        {fmtDate(o.delivery_date)}
                        {o.delivery_time ? ` at ${o.delivery_time}` : ""}
                        {" · "}{o.fulfillment_type === "pickup" ? "pickup" : "delivery"}
                        {Number(o.total) > 0 ? ` · ${money(o.total)}` : ""}
                        {o.assigned_name ? ` · ${o.assigned_name}` : ""}
                      </div>
                    </div>
                    <div className="row-side">
                      {d < today && <span className="pill pill-rust pill-pulse">Overdue</span>}
                      {d === today && <span className="pill pill-amber">Today</span>}
                      <StatusPill status={o.status} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="stack" style={{ gap: 14 }}>
            <div className="card">
              <div className="card-title">Top customers, all time</div>
              {topCustomers.length === 0 ? (
                <div className="empty">No delivered orders yet.</div>
              ) : (
                <Leaderboard rows={topCustomers.map((t) => ({ label: t.customer_name, value: Number(t.rev) }))} />
              )}
            </div>
            <div className="card">
              <div className="card-title">Stock on hand, oldest first</div>
              {stock.length === 0 ? (
                <div className="empty">No stock logged. Add intake from the Inventory tab.</div>
              ) : (
                stock.map((s) => (
                  <div className="row" key={s.variety}>
                    <div className="row-main">
                      <div className="row-title">{s.variety}</div>
                      <div className="row-sub">{s.qty} stems on hand</div>
                    </div>
                    <div className="row-side">
                      <FreshMeter intakeDate={s.oldest} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
