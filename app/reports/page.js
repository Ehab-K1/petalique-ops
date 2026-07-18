import Nav from "@/components/Nav";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db, invoiceTotals } from "@/lib/db";
import { money, fmtDate, BarChart, Leaderboard } from "@/components/ui";
import { CountUp, Tilt } from "@/components/client";
import ExportCSV from "@/components/ReportsClient";

export const dynamic = "force-dynamic";

const RANGES = {
  this_month: { label: "This month" },
  last_month: { label: "Last month" },
  last_90: { label: "Last 90 days" },
  this_year: { label: "This year" },
  all: { label: "All time" },
};

function rangeDates(range) {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "last_month") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(startOfMonth) };
  }
  if (range === "last_90") {
    const d = new Date(now); d.setDate(d.getDate() - 90);
    return { from: iso(d), to: "2999-12-31" };
  }
  if (range === "this_year") {
    return { from: iso(new Date(now.getFullYear(), 0, 1)), to: "2999-12-31" };
  }
  if (range === "all") return { from: "1900-01-01", to: "2999-12-31" };
  return { from: iso(startOfMonth), to: "2999-12-31" };
}

export default async function ReportsPage({ searchParams }) {
  const user = await requireUser();
  const sql = await db();
  const sp = await searchParams;
  const range = RANGES[sp?.range] ? sp.range : "this_month";
  const { from, to } = rangeDates(range);

  const [summary, expSummary, byProduct, bySource, byType, byFulfil, topCustomers, byMethod, expByCat, openInvoices, unpaidOrders] = await Promise.all([
    sql`SELECT COALESCE(SUM(total),0)::numeric AS rev, COUNT(*)::int AS c
        FROM orders WHERE deleted_at IS NULL AND status IN ('delivered','picked_up')
        AND delivery_date >= ${from} AND delivery_date < ${to}`,
    sql`SELECT COALESCE(SUM(amount),0)::numeric AS s FROM expenses
        WHERE deleted_at IS NULL AND expense_date >= ${from} AND expense_date < ${to}`,
    sql`SELECT COALESCE(NULLIF(trim(p.product), ''), 'Custom / unspecified') AS product,
               COUNT(*)::int AS c, COALESCE(SUM(o.total),0)::numeric AS rev
        FROM orders o
        LEFT JOIN LATERAL unnest(string_to_array(COALESCE(NULLIF(o.product_types, ''), 'Custom / unspecified'), ', ')) AS p(product) ON true
        WHERE o.deleted_at IS NULL AND o.status <> 'cancelled'
          AND o.delivery_date >= ${from} AND o.delivery_date < ${to}
        GROUP BY 1 ORDER BY rev DESC LIMIT 14`,
    sql`SELECT source, COUNT(*)::int AS c, COALESCE(SUM(total),0)::numeric AS rev
        FROM orders WHERE deleted_at IS NULL AND status <> 'cancelled'
        AND delivery_date >= ${from} AND delivery_date < ${to}
        GROUP BY source ORDER BY rev DESC`,
    sql`SELECT order_type, COUNT(*)::int AS c, COALESCE(SUM(total),0)::numeric AS rev
        FROM orders WHERE deleted_at IS NULL AND status <> 'cancelled'
        AND delivery_date >= ${from} AND delivery_date < ${to}
        GROUP BY order_type ORDER BY rev DESC`,
    sql`SELECT fulfillment_type, COUNT(*)::int AS c
        FROM orders WHERE deleted_at IS NULL AND status <> 'cancelled'
        AND delivery_date >= ${from} AND delivery_date < ${to}
        GROUP BY fulfillment_type`,
    sql`SELECT c.id AS customer_id, COALESCE(c.name, o.customer_name) AS name,
               COUNT(o.id)::int AS orders, COALESCE(SUM(o.total),0)::numeric AS rev
        FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.deleted_at IS NULL AND o.status IN ('delivered','picked_up')
          AND o.delivery_date >= ${from} AND o.delivery_date < ${to}
        GROUP BY c.id, COALESCE(c.name, o.customer_name)
        ORDER BY rev DESC LIMIT 10`,
    sql`SELECT method, COALESCE(SUM(amount),0)::numeric AS s, COUNT(*)::int AS c
        FROM payments WHERE deleted_at IS NULL AND paid_date >= ${from} AND paid_date < ${to}
        GROUP BY method ORDER BY s DESC`,
    sql`SELECT category, COALESCE(SUM(amount),0)::numeric AS s, COUNT(*)::int AS c
        FROM expenses WHERE deleted_at IS NULL AND expense_date >= ${from} AND expense_date < ${to}
        GROUP BY category ORDER BY s DESC`,
    sql`SELECT i.*, COALESCE(pp.paid, 0)::numeric AS paid
        FROM invoices i
        LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments WHERE deleted_at IS NULL GROUP BY invoice_id) pp
          ON pp.invoice_id = i.id
        WHERE i.deleted_at IS NULL AND i.kind = 'invoice' AND i.status NOT IN ('paid','void','draft')`,
    sql`SELECT COALESCE(SUM(total),0)::numeric AS s, COUNT(*)::int AS c FROM orders
        WHERE deleted_at IS NULL AND payment_status <> 'paid' AND status <> 'cancelled'`,
  ]);

  const rev = Number(summary[0].rev);
  const exp = Number(expSummary[0].s);
  const profit = rev - exp;
  const aov = summary[0].c > 0 ? rev / summary[0].c : 0;

  // Accounts receivable aging from open invoice balances
  const today = new Date().toISOString().slice(0, 10);
  const buckets = { current: 0, d1_7: 0, d8_30: 0, d31_60: 0, d60p: 0 };
  const arRows = [];
  for (const inv of openInvoices) {
    const t = invoiceTotals(inv);
    const bal = Math.max(0, t.total - Number(inv.paid || 0));
    if (bal <= 0.005) continue;
    const due = inv.due_date ? String(inv.due_date).slice(0, 10) : null;
    let bucket = "current";
    let daysLate = 0;
    if (due && due < today) {
      daysLate = Math.floor((new Date(today) - new Date(due)) / 86400000);
      bucket = daysLate <= 7 ? "d1_7" : daysLate <= 30 ? "d8_30" : daysLate <= 60 ? "d31_60" : "d60p";
    }
    buckets[bucket] += bal;
    arRows.push({ id: inv.id, number: inv.number, customer: inv.customer_name, balance: bal, due, daysLate });
  }
  arRows.sort((a, b) => b.daysLate - a.daysLate);
  const arTotal = Object.values(buckets).reduce((s, v) => s + v, 0);

  const csvProducts = byProduct.map((r) => ({ product: r.product, orders: r.c, revenue: Number(r.rev).toFixed(2) }));
  const csvCustomers = topCustomers.map((r) => ({ customer: r.name, orders: r.orders, revenue: Number(r.rev).toFixed(2) }));
  const csvAR = arRows.map((r) => ({ invoice: r.number, customer: r.customer, balance: r.balance.toFixed(2), due: r.due || "", days_late: r.daysLate }));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Reports</div>
        <div className="page-sub">What is selling, who owes you, and where the money goes.</div>

        <div className="toolbar">
          <div className="seg">
            {Object.entries(RANGES).map(([k, v]) => (
              <Link key={k} href={`/reports?range=${k}`} className={"seg-link" + (range === k ? " on" : "")}>
                {v.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-4 stagger" style={{ marginBottom: 16 }}>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={rev} money /></div>
            <div className="stat-label">Revenue ({summary[0].c} completed orders)</div>
          </Tilt>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={exp} money /></div>
            <div className="stat-label">Expenses</div>
          </Tilt>
          <Tilt className="card stat">
            <div className="stat-value" style={{ color: profit >= 0 ? "var(--green-bright)" : "var(--rust)" }}>
              <CountUp value={profit} money />
            </div>
            <div className="stat-label">Profit{rev > 0 ? ` · ${((profit / rev) * 100).toFixed(0)}% margin` : ""}</div>
          </Tilt>
          <Tilt className="card stat">
            <div className="stat-value"><CountUp value={aov} money /></div>
            <div className="stat-label">Average order value</div>
          </Tilt>
        </div>

        <div className="grid grid-2 stagger" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-title">
              Revenue by product
              <span className="spacer" />
              <ExportCSV filename={`products-${range}`} rows={csvProducts} />
            </div>
            {byProduct.length === 0 ? (
              <div className="empty">No orders in this period.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Product</th><th style={{ textAlign: "right" }}>Orders</th><th style={{ textAlign: "right" }}>Revenue</th></tr></thead>
                  <tbody>
                    {byProduct.map((r) => (
                      <tr key={r.product}>
                        <td style={{ fontWeight: 550 }}>{r.product}</td>
                        <td style={{ textAlign: "right" }}>{r.c}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{money(r.rev)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="row-sub" style={{ marginTop: 8 }}>
                  Orders with several products count toward each product line.
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              Top customers
              <span className="spacer" />
              <ExportCSV filename={`customers-${range}`} rows={csvCustomers} />
            </div>
            {topCustomers.length === 0 ? (
              <div className="empty">No completed orders in this period.</div>
            ) : (
              topCustomers.map((r, i) => (
                <div className="row" key={i}>
                  <div className="row-main">
                    <div className="row-title">
                      {r.customer_id
                        ? <Link href={`/customers/${r.customer_id}`} className="link-green">{r.name}</Link>
                        : r.name}
                    </div>
                    <div className="row-sub">{r.orders} order{r.orders === 1 ? "" : "s"}</div>
                  </div>
                  <div className="row-side"><strong>{money(r.rev)}</strong></div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">
            Money owed to you — invoice aging
            <span className="spacer" />
            <span className="balance-chip due">{money(arTotal)} open</span>
            <ExportCSV filename="receivables" rows={csvAR} />
          </div>
          <div className="grid grid-4" style={{ marginBottom: 12 }}>
            <div className="card stat" style={{ padding: 12 }}>
              <div className="stat-value" style={{ fontSize: 18 }}>{money(buckets.current)}</div>
              <div className="stat-label">Not yet due</div>
            </div>
            <div className="card stat" style={{ padding: 12 }}>
              <div className="stat-value" style={{ fontSize: 18 }}>{money(buckets.d1_7)}</div>
              <div className="stat-label">1–7 days late</div>
            </div>
            <div className="card stat" style={{ padding: 12 }}>
              <div className="stat-value" style={{ fontSize: 18 }}>{money(buckets.d8_30)}</div>
              <div className="stat-label">8–30 days late</div>
            </div>
            <div className="card stat" style={{ padding: 12 }}>
              <div className="stat-value" style={{ fontSize: 18, color: buckets.d31_60 + buckets.d60p > 0 ? "var(--rust)" : undefined }}>
                {money(buckets.d31_60 + buckets.d60p)}
              </div>
              <div className="stat-label">30+ days late</div>
            </div>
          </div>
          {arRows.length === 0 ? (
            <div className="empty">No open invoice balances. 🎉</div>
          ) : (
            arRows.slice(0, 12).map((r) => (
              <div className="row" key={r.id}>
                <div className="row-main">
                  <div className="row-title"><Link href={`/invoices?open=${r.id}`} className="link-green">{r.number}</Link> · {r.customer}</div>
                  <div className="row-sub">{r.due ? `due ${fmtDate(r.due)}` : "no due date"}{r.daysLate > 0 ? ` · ${r.daysLate} days late` : ""}</div>
                </div>
                <div className="row-side">
                  <span className={"balance-chip " + (r.daysLate > 0 ? "due" : "")}>{money(r.balance)}</span>
                </div>
              </div>
            ))
          )}
          <div className="row-sub" style={{ marginTop: 10 }}>
            Plus <Link href="/orders?filter=unpaid" className="link-green">{unpaidOrders[0].c} orders not fully paid</Link> worth {money(unpaidOrders[0].s)} (including those without an invoice).
          </div>
        </div>

        <div className="grid grid-2 stagger" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-title">Where orders come from</div>
            {bySource.length === 0 ? <div className="empty">No orders in this period.</div> : (
              <Leaderboard rows={bySource.map((r) => ({
                label: r.source === "webform" ? "Web form" : r.source === "invoice" ? "From invoices" : "Staff entered",
                value: Number(r.rev),
              }))} />
            )}
            <div className="row-sub" style={{ marginTop: 10 }}>
              {byFulfil.map((f) => `${f.c} ${f.fulfillment_type}`).join(" · ") || ""}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Payments collected by method</div>
            {byMethod.length === 0 ? <div className="empty">No payments in this period.</div> : (
              <Leaderboard rows={byMethod.map((r) => ({ label: r.method.replace("_", "-"), value: Number(r.s) }))} />
            )}
          </div>
        </div>

        <div className="grid grid-2 stagger">
          <div className="card">
            <div className="card-title">Order types</div>
            {byType.length === 0 ? <div className="empty">No orders in this period.</div> : (
              <BarChart data={byType.map((r) => ({ label: r.order_type, value: Number(r.rev) }))} height={130} />
            )}
          </div>
          <div className="card">
            <div className="card-title">Expenses by category</div>
            {expByCat.length === 0 ? <div className="empty">No expenses in this period.</div> : (
              <Leaderboard rows={expByCat.map((r) => ({ label: r.category, value: Number(r.s) }))} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
