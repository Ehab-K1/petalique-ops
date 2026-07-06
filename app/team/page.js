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

  const users = await sql`SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC`;
  const plain = (rows) => JSON.parse(JSON.stringify(rows));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Team</div>
        <div className="page-sub">
          Give each partner their own login. Admins can manage the team; staff can do everything else.
        </div>
        <TeamClient users={plain(users)} me={user.id} />
      </div>
    </>
  );
}
