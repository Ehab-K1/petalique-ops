import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatusPill, FreshMeter, fmtDate, money } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const sql = await db();

  const upcoming = await sql`
    SELECT * FROM orders
    WHERE status NOT IN ('delivered','cancelled')
    ORDER BY delivery_date ASC, delivery_time ASC
    LIMIT 12`;

  const overdue = await sql`
    SELECT COUNT(*)::int AS c FROM orders
    WHERE delivery_date < CURRENT_DATE AND status NOT IN ('delivered','cancelled')`;

  const dueToday = await sql`
    SELECT COUNT(*)::int AS c FROM orders
    WHERE delivery_date = CURRENT_DATE AND status NOT IN ('delivered','cancelled')`;

  const aging = await sql`
    SELECT COUNT(*)::int AS c FROM inventory_batches
    WHERE status = 'available' AND intake_date <= CURRENT_DATE - 7`;

  const stock = await sql`
    SELECT variety, SUM(quantity)::int AS qty, MIN(intake_date) AS oldest
    FROM inventory_batches
    WHERE status = 'available' AND quantity > 0
    GROUP BY variety
    ORDER BY MIN(intake_date) ASC`;

  const weekRevenue = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS rev, COUNT(*)::int AS c
    FROM orders
    WHERE status = 'delivered' AND delivery_date >= date_trunc('week', CURRENT_DATE)`;

  const monthRevenue = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS rev, COUNT(*)::int AS c
    FROM orders
    WHERE status = 'delivered' AND delivery_date >= date_trunc('month', CURRENT_DATE)`;

  const unpaid = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS rev, COUNT(*)::int AS c
    FROM orders
    WHERE payment_status <> 'paid' AND status <> 'cancelled'`;

  const today = new Date().toISOString().slice(0, 10);
  const hasAlerts = overdue[0].c > 0 || dueToday[0].c > 0 || aging[0].c > 0;

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">The day at a glance.</div>

        {hasAlerts && (
          <div className="alert">
            <div className="alert-title">Needs attention</div>
            {overdue[0].c > 0 && <p>{overdue[0].c} deliver{overdue[0].c === 1 ? "y is" : "ies are"} past due.</p>}
            {dueToday[0].c > 0 && <p>{dueToday[0].c} due today.</p>}
            {aging[0].c > 0 && <p>{aging[0].c} stem batch{aging[0].c === 1 ? "" : "es"} at 7+ days old. Use or discount now.</p>}
          </div>
        )}

        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          <div className="card stat">
            <div className="stat-value">{money(weekRevenue[0].rev)}</div>
            <div className="stat-label">Delivered revenue this week ({weekRevenue[0].c} orders)</div>
          </div>
          <div className="card stat">
            <div className="stat-value">{money(monthRevenue[0].rev)}</div>
            <div className="stat-label">Delivered revenue this month ({monthRevenue[0].c} orders)</div>
          </div>
          <div className="card stat">
            <div className="stat-value">{money(unpaid[0].rev)}</div>
            <div className="stat-label">Outstanding, not yet paid ({unpaid[0].c} orders)</div>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-title">Upcoming deliveries</div>
            {upcoming.length === 0 ? (
              <div className="empty">Nothing scheduled. Add orders from the Deliveries tab.</div>
            ) : (
              upcoming.map((o) => {
                const d = String(o.delivery_date).slice(0, 10);
                return (
                  <div className="row" key={o.id}>
                    <div className="row-main">
                      <div className="row-title">{o.customer_name}</div>
                      <div className="row-sub">
                        {fmtDate(o.delivery_date)}
                        {o.delivery_time ? ` at ${o.delivery_time}` : ""} · {o.order_type}
                        {Number(o.total) > 0 ? ` · ${money(o.total)}` : ""}
                      </div>
                    </div>
                    <div className="row-side">
                      {d < today && <span className="pill pill-rust">Overdue</span>}
                      {d === today && <span className="pill pill-amber">Today</span>}
                      <StatusPill status={o.status} />
                    </div>
                  </div>
                );
              })
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
    </>
  );
}
