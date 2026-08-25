# LedgerDesk — Web-Based Billing System

A complete billing / POS system for shops and service businesses, built with **pure HTML, CSS and JavaScript** — no frameworks, no build step, no server required. All data is stored safely in your browser's `localStorage`.

## Quick start

**Option 1 — just open it**

Double-click `index.html`. That's it.

**Option 2 — run a tiny local server** (nicer URLs)

```bash
python -m http.server 8470
```

Then open <http://localhost:8470>.

**Default login:** username `admin`, password `admin123`
(change it in **Settings → Password & reset**)

## What's inside

| Module | What it does |
|---|---|
| **Dashboard** | Today's collection, monthly revenue, pending payments, low-stock alerts, 7-day sales chart, category mix, top items, recent bills |
| **New Bill (POS)** | Search-and-tap catalogue, cart with qty steppers and per-line discounts, bill-level discount (% or flat), CGST/SGST auto-calculation, Cash/UPI/Card/Credit modes, change calculator, stock validation |
| **Invoices** | Full register with search, status & date filters, one-click print (A4 tax invoice → save as PDF), record later payments against partially-paid bills, delete with automatic stock restore, CSV export |
| **Items & Stock** | Goods *and* services (services skip stock tracking), HSN/SAC codes, GST slabs (0/5/12/18/28%), quick stock-in, low-stock warnings |
| **Customers** | Contact book with GSTIN for B2B invoices, per-customer purchase history, lifetime value and pending amounts |
| **Reports** | Any date range: revenue, GST collected, discounts, pending; day-wise chart, category donut, payment-mode split, best sellers, CSV export |
| **Settings** | Shop profile (printed on every invoice), currency symbol, invoice prefix, default GST, JSON backup/restore, password change, factory reset |

## Billing logic (GST)

- Item rates are **GST-exclusive**; tax is added at bill time and split **CGST + SGST** (intra-state).
- Per-line discount % and bill-level discount are applied **before** tax, proportionally across GST slabs.
- Invoices are numbered sequentially with your prefix (`INV-0001`, `INV-0002`, …).
- Paid bills get a rubber-stamp **PAID** mark; unpaid/partial bills show balance due and can be settled later.

## Data & backups

Everything lives in the browser under the key `ledgerdesk_db_v1`. Use **Settings → Data safety** to download a `.json` backup and restore it on any other computer/browser. A half-finished bill also survives an accidental page refresh.

## Project structure

```
├── index.html          app shell + login
├── css/style.css       full design system (ledger-green theme, print styles)
└── js/
    ├── utils.js        helpers: money/date formatting, modals, toasts, CSV, number-to-words
    ├── db.js           localStorage layer, GST totals engine, seed demo data
    ├── dashboard.js    overview page
    ├── products.js     item & stock master
    ├── customers.js    customer master + history
    ├── billing.js      POS counter
    ├── invoices.js     register, invoice sheet, A4 printing
    ├── reports.js      date-range analysis
    ├── settings.js     shop profile, backup/restore, password
    └── app.js          login/session + hash router
```

First run seeds a demo shop (18 items, 5 customers, ~58 invoices over 30 days) so every screen is alive immediately — wipe it anytime from **Settings → Erase everything**.
