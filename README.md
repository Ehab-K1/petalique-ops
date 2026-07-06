# Petalique Flora — Studio Operations App

A full web app for running the studio: team logins, inventory with freshness tracking,
delivery management, a customer/B2B database, and a weekly order planner driven by real usage.

Everything runs on free tiers: **Vercel** (hosting) + **Neon** (Postgres database).

---

## What's inside

| Page | What it does |
|---|---|
| Dashboard | Overdue/today alerts, aging-stock warnings, weekly and monthly revenue, outstanding payments, stock at a glance |
| Inventory | Log every stem intake (variety, qty, cost, date, source). Freshness meter per batch. Assign batches to orders. Mark used or waste. |
| Deliveries | Every order: customer, items, date/time, address, price, status pipeline (Pending → Delivered), payment status. Delivering an order auto-marks its reserved stems as used. |
| Customers | Retail, planners, venues, corporate, wholesale. Order count, lifetime value, last order, notes. |
| Order Planner | Suggested buy quantities for next week from your last 4 weeks of real usage (+10% buffer, minus stock on hand), plus waste tracking in stems and dollars. |
| Team | Admin-only. Create a login for each partner (admin or staff roles). |

Login sessions are secure httpOnly cookies signed with your secret. Passwords are bcrypt-hashed.
The database schema creates itself automatically on first run, including your admin account.

---

## Deploy in ~15 minutes (one time)

### Step 1 — Create the free database (Neon)
1. Go to **neon.tech** → sign up free (Google login works).
2. Create a project (name it `petalique`). Region: pick a US-East option (closest to Vercel's default).
3. On the project dashboard, click **Connect** and copy the **connection string** (starts with `postgres://`). Keep it handy.

### Step 2 — Put this code on GitHub
1. Go to **github.com** → sign up free → click **New repository** → name it `petalique-ops`, keep it **Private** → Create.
2. On the new repo page, click **uploading an existing file**, drag in ALL the files/folders from this package (keep the folder structure), and commit.
   - Or, if you have git installed: `git init && git add . && git commit -m "init" && git remote add origin <your repo url> && git push -u origin main`

### Step 3 — Deploy on Vercel
1. Go to **vercel.com** → sign up free **with your GitHub account**.
2. Click **Add New → Project** → import `petalique-ops`.
3. Before clicking Deploy, open **Environment Variables** and add these four:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string from Step 1 |
| `SESSION_SECRET` | any long random string (30+ characters, e.g. mash the keyboard) |
| `ADMIN_EMAIL` | your email, e.g. `ehab@petaliqueflora.com` |
| `ADMIN_PASSWORD` | your chosen admin password (8+ characters) |

4. Click **Deploy**. Two minutes later you get a live URL like `petalique-ops.vercel.app`.

### Step 4 — First login
1. Open your URL → you'll land on the login page.
2. Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set. (Your admin account and all database tables are created automatically on this first visit.)
3. Go to **Team** → create a login for each partner.
4. Send the URL to your Telegram group. Everyone uses it from their phone.

### Optional
- **Custom domain**: in Vercel → project → Settings → Domains, add `ops.petaliqueflora.com` (or similar) and follow the DNS instructions.
- **Change admin password later**: currently done by updating `ADMIN_PASSWORD` won't change an existing account — ask Claude to add a password-change page, or create a fresh admin in Team and remove the old one.

---

## Daily workflow (the habit that makes this work)

1. **Flowers arrive** → Inventory → Log new stem intake (variety, qty, cost/stem, source).
2. **Order comes in** → Deliveries → New order. Pick the existing customer if they're in the system.
3. **Building an arrangement** → assign the batch to the order (Inventory), or just "Mark used" for walk-in/bouquet stock.
4. **Driver leaves** → set status to Out for delivery; when done → Delivered (payment status too).
5. **Anything dies** → mark the batch Waste. This is what makes the waste report honest.
6. **Sunday night** → open Order Planner → place next week's order from the suggested quantities.

## Local development (optional)
```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```
