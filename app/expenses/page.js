import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import ExpensesClient from "@/components/ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const user = await requireUser();
  const sql = await db();

  const expenses = await sql`
    SELECT * FROM expenses
    ORDER BY expense_date DESC, id DESC
    LIMIT 500`;

  const thisMonth = await sql`
    SELECT COALESCE(SUM(amount),0)::numeric AS s, COUNT(*)::int AS c FROM expenses
    WHERE expense_date >= date_trunc('month', CURRENT_DATE)`;

  const lastMonth = await sql`
    SELECT COALESCE(SUM(amount),0)::numeric AS s FROM expenses
    WHERE expense_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
      AND expense_date < date_trunc('month', CURRENT_DATE)`;

  const thisYear = await sql`
    SELECT COALESCE(SUM(amount),0)::numeric AS s FROM expenses
    WHERE expense_date >= date_trunc('year', CURRENT_DATE)`;

  const byCategory = await sql`
    SELECT category, COALESCE(SUM(amount),0)::numeric AS s FROM expenses
    WHERE expense_date >= date_trunc('month', CURRENT_DATE)
    GROUP BY category ORDER BY s DESC`;

  const revenueThisMonth = await sql`
    SELECT COALESCE(SUM(total),0)::numeric AS s FROM orders
    WHERE status IN ('delivered','picked_up') AND delivery_date >= date_trunc('month', CURRENT_DATE)`;

  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Expenses</div>
        <div className="page-sub">
          Every dollar going out — flowers, materials, services, legal, payroll. Log purchases here
          (inventory intakes track stems, this page tracks the money) so your profit numbers stay honest.
        </div>
        <ExpensesClient
          expenses={plain(expenses)}
          thisMonth={plain(thisMonth)[0]}
          lastMonth={plain(lastMonth)[0]}
          thisYear={plain(thisYear)[0]}
          byCategory={plain(byCategory)}
          revenueThisMonth={plain(revenueThisMonth)[0]}
        />
      </div>
    </>
  );
}
