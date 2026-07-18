# Petalique Ops — Studio OS (v3)

The operations system for Petalique Flora: a connected CRM, order pipeline, invoicing,
payments ledger, inventory, reporting, and a public order form — in one Next.js app.
Runs on free tiers: **Vercel** (hosting) + **Neon** (Postgres).

## What v3 adds (the "everything talks to everything" release)

- **Connected records.** Every order, invoice and payment links to a customer record,
  created or matched automatically (by phone → email → name) — including web form
  submissions and a one-time backfill of all historical data.
- **Detail pages.** `/orders/[id]` (status pipeline, payments with balance, linked
  invoices, activity timeline) and `/customers/[id]` (lifetime value, full history,
  merge-duplicates).
- **Sync engine.** Record a payment → the invoice flips to partial/paid → the linked
  order's payment status updates → dashboard and reports agree. Deleting/restoring a
  payment re-syncs everything it touched.
- **No more destructive mistakes.** All deletes are soft: every delete shows an Undo
  toast, and admins can restore anything from Settings → Trash. Order status can move
  backwards by clicking any step on the pipeline.
- **App shell.** Sidebar navigation, ⌘K global search across all records, a
  notification bell (new inquiries, due today, overdue orders & invoices, aging stock),
  and a "+ New" quick-add menu.
- **Orders three ways.** List, drag-and-drop board, and a delivery calendar.
- **Reports.** Revenue/expenses/profit by period, revenue by product, top customers,
  where orders come from, payment methods, expense categories, and invoice aging
  (who owes what, how late) — all exportable to CSV.
- **Settings.** Business profile (name, contact, tax rate, invoice footer) and an
  editable product/add-on catalog that powers the public order form — no redeploys
  to change the menu. Activity log records who did what across the app.

## Stack

- Next.js 15 App Router (JavaScript, no CSS framework — single `globals.css` design system)
- Neon Postgres via `@neondatabase/serverless`; schema migrates itself in `lib/db.js`
  (`ensureSchema` — all changes are additive, existing data is preserved)
- Cookie-session auth (admin/staff), bcryptjs
- Zero other runtime dependencies; charts are hand-rolled SVG

## Key files

| Area | Files |
| --- | --- |
| Schema + migrations + backfill | `lib/db.js` |
| Customer matching + status sync | `lib/sync.js` |
| Audit log | `lib/activity.js` |
| App shell (sidebar, search, bell) | `components/Nav.js`, `CommandPalette.js`, `NotificationBell.js` |
| Orders | `components/OrdersClient.js`, `OrderForm.js`, `OrderDetail.js`, `app/orders/[id]/` |
| Customers | `components/CustomersClient.js`, `CustomerDetail.js`, `app/customers/[id]/` |
| Money | `components/PaymentsClient.js`, `InvoicesClient.js`, `app/reports/` |
| Config | `app/settings/`, `components/SettingsClient.js`, `app/api/catalog/`, `app/api/settings/` |
| Safety net | `app/api/trash/`, soft-delete columns everywhere |

## Environment

```
DATABASE_URL=postgres://...        # Neon connection string
SESSION_SECRET=<long random string>
ADMIN_EMAIL=owner@petalique.com    # first-boot admin (only used on empty DB)
ADMIN_PASSWORD=<something strong>
```

## Deploy

Push to `main` — Vercel builds and deploys. The first request after deploy runs the
additive schema migration and (once) the customer-linking backfill.
