import Nav from "@/components/Nav";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db, getBusiness } from "@/lib/db";
import SettingsClient from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  const sql = await db();

  const business = await getBusiness(sql);
  const catalog = await sql`SELECT * FROM catalog_items ORDER BY kind ASC, sort ASC, id ASC`;

  const plain = (x) => JSON.parse(JSON.stringify(x));

  return (
    <>
      <Nav user={user} />
      <div className="page">
        <div className="page-title">Settings</div>
        <div className="page-sub">
          Your business profile, the product catalog that powers the order form, and the trash where deleted things can be recovered.
        </div>
        <SettingsClient business={plain(business)} catalog={plain(catalog)} />
      </div>
    </>
  );
}
