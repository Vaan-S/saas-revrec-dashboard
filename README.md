# SaaS Revenue Recognition Dashboard

An interactive model of how a SaaS business recognizes revenue under ASC 606 — covering annual and monthly subscriptions, usage-based billing, deferred revenue, churn, mid-term plan changes, journal entries, and month-end reconciliation.

Built as a hands-on demonstration that revenue recognition, deferred revenue roll-forwards, and the SaaS-specific accounting that trips up generalists can be modeled correctly, end to end, with every figure traceable back to a contract and a journal entry.

**🔗 [View Live Demo](https://saas-revrec-dashboard.vercel.app/)**

---

## Highlights

- **Three billing models** — annual subscriptions (straight-line recognition over the term), monthly subscriptions (bill and recognize together), and usage-based/hybrid billing (recognize as consumed, with a fixed platform fee recognized straight-line)
- **Deferred revenue roll-forward** — bookings build the liability, recognition unwinds it, month by month, always tying back to zero over the service period
- **Point-in-time reporting** — pick any month and the dashboard shows only what the business knows as of that month; future churn and plan changes do not appear before they happen
- **Journal entries** — every event produces balanced debit/credit entries (billing, recognition, expansion, contraction, refund, forfeiture), with a running balance check and CSV export
- **Churn handling** — forfeiture (remaining deferred released to revenue) and refund (remaining deferred returned as cash) treated distinctly, with the correct accounting for each
- **Mid-term plan changes** — an upsell and a downgrade modeled end to end, flowing through recognized revenue, MRR, deferred revenue, and the journal entries, with matching contract amendments
- **Reconciliation module** — upload an ERP-format revenue export and the dashboard compares the model against the posted GL, flagging variances for investigation
- **Supporting documents** — a repository of executed sample contracts, termination amendments, and plan-change amendments, plus a downloadable Excel workbook that traces every metric with live formulas

---

## The Problem

SaaS revenue can't just be booked when the cash arrives — it has to be earned over time. If a customer pays for a year of software up front, the company hasn't earned all that money yet; it earns it month by month as it delivers the service. Until then, the unearned part sits on the balance sheet as deferred revenue.

Keeping that straight is usually one accountant's job at month-end: spreading annual payments across the year, recognizing usage as customers consume it, clearing deferred revenue when someone cancels or downgrades, and reconciling it all to the general ledger. This project models that whole cycle for a fictional SaaS company — so the logic is visible, and every number traces from the contract to the journal entry to the reported metric.

---

## Features

### Billing and Revenue Recognition

Handles three billing models side by side. Annual subscriptions are billed up front, booked to deferred revenue, and recognized straight-line across the twelve-month term. Monthly subscriptions are billed and recognized together each period. Usage-based customers are recognized as they consume, billed in arrears, with no deferred balance; hybrid customers add a fixed platform fee that is recognized straight-line alongside the variable usage.

### Deferred Revenue Roll-Forward

A monthly roll-forward shows the deferred balance building from bookings and unwinding through recognition and refunds. The balance is presented as a chart and as a formula-traced table in the accompanying workbook, and it resolves to zero over each contract's service period — including when a contract ends early or changes mid-term.

### Point-in-Time Reporting

The dashboard reports as of a selected month, the way a real close does. Choosing March shows the business as it stood in March: customers who start later are not yet listed, and a customer who churns in October still appears active in March. Metrics, journal entries, and the customer list all respect the selected reporting month.

### Journal Entries

Every economic event generates a balanced journal entry — annual billing to deferred revenue, monthly recognition, usage recognition against unbilled receivable, expansion and contraction on plan changes, refund of excess prepaid on a downgrade, and release of remaining deferred on a forfeiture. Entries are grouped by customer, checked for debit/credit balance, and exportable to CSV.

### Churn and Plan Changes

Two churn treatments are modeled distinctly. Under forfeiture, the remaining deferred balance is released to revenue in the churn month. Under refund, it is returned to the customer as cash, with no revenue impact. Mid-term plan changes are modeled the same rigorous way: an upsell increases recognized revenue and MRR from the change month, and a downgrade on a prepaid annual contract reduces recognition and refunds the excess prepaid so the deferred balance still unwinds to zero. Each churned or amended customer has a corresponding termination or amendment document.

### Reconciliation

A reconciliation module accepts an ERP-format revenue export and compares the model's recognized revenue against the posted GL figure for each month. Matching months are marked clean; variances are flagged for investigation, with a total variance line. Two small discrepancies are seeded into the sample data so the check has something to catch.

### Supporting Documents and Workbook

A contract repository links every customer to an executed sample subscription agreement, with separate termination amendments for churned customers and plan-change amendments for the two mid-term changes. A downloadable Excel workbook reproduces every metric on the dashboard with live formulas, so the calculations can be inspected independently of the app.

---

## What This Models — and What It Simplifies

This is a teaching model built from scratch, not a production revenue system, and it is deliberately transparent about where it simplifies. Being clear about the boundaries is part of the point.

**What it models faithfully:**

- Straight-line recognition of subscription revenue over the service period
- Deferred revenue that builds from bookings and fully unwinds through recognition, refunds, and forfeitures
- Usage recognized as consumed under the right-to-invoice practical expedient
- Distinct forfeiture and refund treatments on churn, with the correct deferred and cash effects
- Mid-term upsell and downgrade, flowing consistently through recognized revenue, MRR, deferred revenue, and journal entries
- Point-in-time reporting that never shows future events before they occur
- Reconciliation of the model against a posted GL export

**What it simplifies:**

- Revenue is recognized straight-line; it does not model variable consideration constraints, standalone selling price allocation across multiple performance obligations, or contract modifications beyond the single upsell and downgrade included
- Net revenue retention is presented on a fixed starting cohort for clarity, rather than a rolling trailing-twelve-month basis
- The mid-term upsell is treated as an incremental monthly charge rather than a re-based deferred schedule
- All data is fictional and generated for demonstration; there is no real production data behind it

---

## Running Locally

Requirements: [Node.js](https://nodejs.org) 18 or later.

```
git clone https://github.com/Vaan-S/saas-revrec-dashboard.git
cd saas-revrec-dashboard
npm install
npm run dev
```

Then open the local URL shown in the terminal (usually `http://localhost:5173`). Use the month selector to move through the reporting periods, adjust customers in the contract table to see the model recalculate, and upload the sample ERP-format export in the reconciliation section to see variance flagging in action. The sample export and the metrics workbook are available from the Downloads section inside the dashboard.

To build for production:

```
npm run build
```

---

## Tech Stack

| Component            | Technology            |
| -------------------- | --------------------- |
| Dashboard            | React, Vite           |
| Charts               | Recharts              |
| Contract documents   | Python, ReportLab     |
| Metrics workbook     | Python, openpyxl      |
| Reconciliation input | ERP-format CSV        |

---

## Author

**Vaanmathi, CA, CPA**
