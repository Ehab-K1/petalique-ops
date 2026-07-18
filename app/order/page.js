import { db, getBusiness } from "@/lib/db";
import PublicOrderForm from "@/components/PublicOrderForm";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const business = await getBusiness();
  return { title: `${business.name} — Order Request` };
}

/* Public page — the product list comes straight from Settings → Product catalog. */
export default async function PublicOrderPage() {
  const sql = await db();
  const business = await getBusiness(sql);
  const items = await sql`SELECT kind, name, price_label FROM catalog_items
    WHERE active = true ORDER BY kind ASC, sort ASC, id ASC`;

  const products = items.filter((i) => i.kind === "product");
  const addons = items.filter((i) => i.kind === "addon");

  const plain = (x) => JSON.parse(JSON.stringify(x));

  return (
    <PublicOrderForm
      products={plain(products)}
      addons={plain(addons)}
      business={plain(business)}
    />
  );
}
