import { db, invoiceTotals } from "@/lib/db";
import { fmtDateLong, money, BloomMark } from "@/components/ui";
import { PrintButton } from "@/components/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  return { title: "Petalique Flora — Document" };
}

export default async function PublicInvoicePage({ params }) {
  const { token } = await params;
  const sql = await db();
  const rows = await sql`SELECT * FROM invoices WHERE token = ${token}`;
  const inv = rows[0];

  if (!inv) {
    return (
      <div className="doc-wrap">
        <div className="doc" style={{ textAlign: "center" }}>
          <BloomMark size={40} />
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--green)", margin: "12px 0 6px" }}>
            Document not found
          </h2>
          <p className="muted">This link may have been removed. Please contact Petalique Flora.</p>
        </div>
      </div>
    );
  }

  const items = Array.isArray(inv.items) ? inv.items : [];
  const t = invoiceTotals(inv);
  const isQuote = inv.kind === "quote";

  return (
    <div className="doc-wrap">
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
        <PrintButton />
      </div>

      <div className="doc">
        <div className="doc-head">
          <div className="doc-brand">
            <span className="mark"><BloomMark size={42} /></span>
            <div>
              <div className="name">Petalique Flora</div>
              <div className="tag">Floral studio</div>
            </div>
          </div>
          <div className="doc-kind">
            <div className="k">{isQuote ? "Quotation" : "Invoice"}</div>
            <div className="n">{inv.number}</div>
            {inv.status === "paid" && !isQuote && (
              <div style={{ marginTop: 6 }}><span className="pill pill-green">PAID</span></div>
            )}
          </div>
        </div>

        <div className="doc-meta">
          <div>
            <h4>{isQuote ? "Prepared for" : "Billed to"}</h4>
            <div className="who">{inv.customer_name}</div>
            {inv.customer_address && <div className="line">{inv.customer_address}</div>}
            {inv.customer_phone && <div className="line">{inv.customer_phone}</div>}
            {inv.customer_email && <div className="line">{inv.customer_email}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <h4>Details</h4>
            <div className="line">Issued: {fmtDateLong(inv.issue_date)}</div>
            {inv.due_date && (
              <div className="line">
                {isQuote ? "Valid until" : "Due"}: {fmtDateLong(inv.due_date)}
              </div>
            )}
            {inv.order_id && <div className="line">Order ref: #{inv.order_id}</div>}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th style={{ textAlign: "right", width: 60 }}>Qty</th>
              <th style={{ textAlign: "right", width: 100 }}>Unit</th>
              <th style={{ textAlign: "right", width: 110 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>{it.desc}</td>
                <td style={{ textAlign: "right" }}>{it.qty}</td>
                <td style={{ textAlign: "right" }}>{money(it.price)}</td>
                <td style={{ textAlign: "right" }}>{money((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="doc-totals">
          <div className="trow"><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
          {t.discount > 0 && <div className="trow"><span>Discount</span><span>−{money(t.discount)}</span></div>}
          <div className="trow"><span>Tax ({Number(inv.tax_rate) || 0}%)</span><span>{money(t.tax)}</span></div>
          <div className="trow grand"><span>Total</span><span>{money(t.total)}</span></div>
        </div>

        {inv.notes && (
          <div className="doc-notes">
            <strong style={{ color: "var(--ink)" }}>Notes</strong>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{inv.notes}</div>
          </div>
        )}

        <div className="doc-foot">
          Thank you for choosing Petalique Flora 🌸
          {isQuote ? " · This quotation is not a receipt of payment." : ""}
        </div>
      </div>
    </div>
  );
}
