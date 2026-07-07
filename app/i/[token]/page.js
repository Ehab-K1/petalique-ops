import { Fragment } from "react";
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
  const depositPct = Number(inv.deposit_pct) || 0;
  const depositAmt = depositPct > 0 ? t.total * (depositPct / 100) : 0;
  const steps = String(inv.notes || "").split("\n").map((s) => s.trim()).filter(Boolean);

  // group consecutive items sharing the same section label under one divider row
  // (e.g. "Friday, August 7, 2026" / "Saturday, August 8, 2026")
  const groups = [];
  for (const it of items) {
    const sec = String(it.section || "").trim();
    const last = groups[groups.length - 1];
    if (last && last.section === sec) {
      last.rows.push(it);
    } else {
      groups.push({ section: sec, rows: [it] });
    }
  }

  return (
    <div className="doc-wrap">
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
        <PrintButton />
      </div>

      <div className="doc">
        <div className="doc-brand-center">
          <div className="mark"><BloomMark size={40} /></div>
          <div className="name">Petalique Flora</div>
          <div className="tag">Premium Floral Designs &amp; Event Rentals</div>
          <div className="contact">hello@petaliqueflora.com | 647-446-3149</div>
        </div>

        <hr className="doc-rule" />

        <div className="doc-kind-center">
          <div className="k">{isQuote ? "Quotation" : "Invoice"}</div>
          <div className="n">{inv.number}</div>
          {inv.status === "paid" && !isQuote && (
            <div style={{ marginTop: 6 }}><span className="pill pill-green">PAID</span></div>
          )}
        </div>

        <div className="doc-meta">
          <div>
            <h4>{isQuote ? "Prepared for" : "Billed to"}</h4>
            <div className="who">{inv.customer_name}</div>
            {inv.customer_phone && <div className="line">Phone: {inv.customer_phone}</div>}
            {inv.customer_email && <div className="line">{inv.customer_email}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <h4>Details</h4>
            <div className="line">Date prepared: {fmtDateLong(inv.issue_date)}</div>
            {inv.event_date && <div className="line">Event date(s): {inv.event_date}</div>}
            {inv.due_date && (
              <div className="line">
                {isQuote ? "Valid until" : "Due"}: {fmtDateLong(inv.due_date)}
              </div>
            )}
            {inv.order_id && <div className="line">Order ref: #{inv.order_id}</div>}
            {inv.customer_address && (
              <>
                <h4 style={{ marginTop: 12 }}>Delivery address</h4>
                <div className="line">{inv.customer_address}</div>
              </>
            )}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item description</th>
              <th style={{ textAlign: "right", width: 60 }}>Qty</th>
              <th style={{ textAlign: "right", width: 100 }}>Unit price</th>
              <th style={{ textAlign: "right", width: 110 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <Fragment key={gi}>
                {g.section && (
                  <tr className="doc-section-row"><td colSpan={4}>{g.section}</td></tr>
                )}
                {g.rows.map((it, i) => (
                  <tr key={i}>
                    <td>
                      <div className="item-name">{it.name ?? it.desc}</div>
                      {it.detail && <div className="item-detail">{it.detail}</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>{it.qty}</td>
                    <td style={{ textAlign: "right" }}>{money(it.price)}</td>
                    <td style={{ textAlign: "right" }}>{money((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>

        <div className="doc-totals">
          <div className="trow"><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
          {t.discount > 0 && <div className="trow"><span>Discount</span><span>−{money(t.discount)}</span></div>}
          <div className="trow"><span>Tax ({Number(inv.tax_rate) || 0}%)</span><span>{money(t.tax)}</span></div>
          <div className="trow grand"><span>{isQuote ? "Estimated total" : "Total"}</span><span>{money(t.total)}</span></div>
          {depositPct > 0 && (
            <div className="trow deposit">
              <span>{depositPct}% deposit to secure date</span><span>{money(depositAmt)}</span>
            </div>
          )}
        </div>

        {steps.length > 0 && (
          <div className="doc-steps">
            <div className="doc-steps-title">Booking &amp; Next Steps</div>
            <ol>
              {steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
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
