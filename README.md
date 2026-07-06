# Petalique Flora — Studio Operations App v2

A full web app for running the studio: team logins, orders (delivery **and pickup**), payments
ledger, invoices & quotations with shareable links and PDF export, a public customer order form,
inventory with freshness tracking, a customer/B2B database, and a weekly order planner.

Everything runs on free tiers: **Vercel** (hosting) + **Neon** (Postgres database).

---

## What's inside

| Page | What it does |
|---|---|
| Dashboard | This month vs last month (with % change), yearly total, **profit and margin**, revenue-vs-expenses 12-month chart, team sales leaderboard, delivery/pickup split, top customers, alerts, new web-form inquiries |
| Orders | Every delivery **and pickup**: customer, items, date/time, address, price, status pipeline, payment status, sold-by assignment, occasion. Search + filters. Full edit on everything. |
| Payments | Ledger of every payment (cash, e-transfer, card…), linked to orders. Auto-updates the order's paid/deposit status. Monthly totals and method breakdown. |
| Expenses | Track every cost — flowers, materials, services, legal, payroll, delivery, marketing, rent. Category breakdown, recurring flags, and live profit + margin. |
| Invoices | Create invoices and quotations with line items, tax and discount. Share as a public link or export as PDF (print). Convert quotes to invoices. Track draft → sent → paid. |
| Customers | Retail, planners, venues, corporate, wholesale. Order count, lifetime value, last order, notes. Full edit. |
| Inventory | Log every stem intake. Freshness meter per batch. Assign batches to orders. Mark used or waste. Full edit. |
| Planner | Suggested buy quantities for next week from your last 4 weeks of real usage, plus waste tracking. |
| Team | Admin-only. Logins for each partner, role management, password resets, per-person monthly sales. |

### The public order form — replaces Google Forms

Share **`https://your-app-url/order`** with customers (there's a copy-link button at the top of
the Orders page). Customers pick **delivery or pickup**, describe what they want, and the request
lands directly in your Orders list marked **Web form · Pending** — no syncing, no Google account,
no re-typing. New inquiries are highlighted on the dashboard.

### Invoices & quotes — shareable + PDF

Each invoice/quote gets a private share link (`/i/<token>`) you can text or email to the customer.
The page is print-optimized: the **Download PDF / Print** button produces a clean, branded PDF.

---

## Deploy (already set up)

The app deploys from this GitHub repo via Vercel. Environment variables (already configured):

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `SESSION_SECRET` | long random string |
| `ADMIN_EMAIL` | first admin login email |
| `ADMIN_PASSWORD` | first admin password |

New database tables and columns (payments, invoices, pickup/assignment fields) are created
**automatically** on the first page load after deploying — no manual migration needed.

## Local development (optional)

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```
