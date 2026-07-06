import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import TeamClient from "@/components/TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  const sql = await db();

  const users = await sql`
    SELECT u.id, u.email, u.name, u.role, u.created_at,
      COALESCE(s.rev, 0)::numeric AS month_sales,
      COALESCE(s.c, 0)::int AS month_orders
    FROM users u
    LEFT JOIN (
      SELECT assigned_user_id, SUM(total) AS rev, COUNT(*) AS c
      FROM orders
      WHERE status <> 'cancelled' AND delivery_date >= date_trunc('month', CURRENT_DATE)
      GROUP BY assigned_user_id
    ) s ON s.assigned_user_id = u.id
    ORDER BY u.created_at ASC`;
  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Team</div>
        <div className="page-sub">
          Give each partner their own login. Orders can be assigned to anyone here, and their sales are tracked on the dashboard.
        </div>
        <TeamClient users={plain(users)} me={user.id} />
      </div>
    </>
  );
}
