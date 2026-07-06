import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/components/ui";
import { CountUp, Tilt } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const user = await requireUser();
  const sql = await db();

  const rows = await sql`
    SELECT
      variety,
      COALESCE(SUM(CASE WHEN status = 'available' THEN quantity ELSE 0 END), 0)::int AS on_hand,
      COALESCE(SUM(CASE WHEN status = 'reserved' THEN quantity ELSE 0 END), 0)::int AS reserved,
      COALESCE(SUM(CASE WHEN intake_date >= CURRENT_DATE - 28 THEN initial_quantity - quantity ELSE 0 END), 0)::int AS consumed_28d,
      AVG(unit_cost) FILTER (WHERE unit_cost IS NOT NULL) AS avg_cost
    FROM inventory_batches
    GROUP BY variety
    ORDER BY variety ASC`;

  const waste = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'waste' THEN quantity * COALESCE(unit_cost, 0) ELSE 0 END), 0)::numeric AS waste_value,
      COALESCE(SUM(CASE WHEN status = 'waste' THEN quantity ELSE 0 END), 0)::int AS waste_stems
    FROM inventory_batches
    WHERE intake_date >= CURRENT_DATE - 28`;

  const plan = rows.map((r) => {
    const weekly = Math.ceil(Number(r.consumed_28d) / 4);
    const target = Math.ceil(weekly * 1.1);
    const suggested = Math.max(0, target - Number(r.on_hand));
    return { ...r, weekly, suggested };
  });

  const anyUsage = plan.some((p) => p.weekly > 0);

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Weekly order planner</div>
        <div className="page-sub">
          Suggested buy quantities from your last 4 weeks of real usage, plus a 10 percent buffer, minus what is already on hand.
          The longer you log intake and usage, the sharper this gets.
        </div>

        <div className="grid grid-2 stagger" style={{ marginBottom: 16 }}>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={waste[0].waste_stems} /></div>
            <div className="stat-label">Stems wasted in the last 28 days</div>
          </Tilt>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={waste[0].waste_value} money /></div>
            <div className="stat-label">Estimated waste cost (where stem cost was logged)</div>
          </Tilt>
        </div>

        <div className="card">
          <div className="card-title">Suggested order for next week</div>
          {!anyUsage ? (
            <div className="empty">
              Not enough usage history yet. Log intakes in Inventory and mark stems used as you build,
              and this table will start suggesting quantities within a week or two.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Variety</th>
                    <th>Weekly usage</th>
                    <th>On hand</th>
                    <th>Reserved</th>
                    <th>Suggested buy</th>
                    <th>Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.filter((p) => p.weekly > 0 || p.on_hand > 0).map((p) => (
                    <tr key={p.variety}>
                      <td style={{ fontWeight: 550 }}>{p.variety}</td>
                      <td>{p.weekly}</td>
                      <td>{p.on_hand}</td>
                      <td>{p.reserved}</td>
                      <td style={{ fontWeight: 600, color: p.suggested > 0 ? "var(--green)" : "var(--ink-soft)" }}>
                        {p.suggested > 0 ? p.suggested : "—"}
                      </td>
                      <td>
                        {p.suggested > 0 && p.avg_cost != null
                          ? money(p.suggested * Number(p.avg_cost))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
