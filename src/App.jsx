import React, { useState, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

// ── Sample seed data: a mock SaaS company "Northbound" ──────────────
const PLAN_PRICES = { Starter: 1200, Growth: 4800, Enterprise: 18000 }; // annual CAD
const BILLING = { Monthly: 1, Annual: 12 };

// Usage-based billing: revenue = actual monthly usage, recognized as consumed (billed in arrears).
// Each usage customer carries a 12-month usage vector (CAD) so figures are stable/reproducible.
// Hybrid customers also carry a fixed monthly platform fee recognized straight-line.
const USAGE_PROFILES = {
  // Pure usage — fluctuates with consumption, no fixed fee
  "Meridian Data": { fixedMonthly: 0, usage: [0, 0, 3200, 3600, 3100, 4200, 4800, 4500, 5300, 5000, 5600, 6100] },
  // Hybrid — $800/mo platform fee + variable usage on top
  "Nimbus Networks": { fixedMonthly: 800, usage: [0, 0, 0, 1500, 1800, 1650, 2100, 2400, 2250, 2600, 2900, 3050] },
};

const SEED = [
  { id: 1, name: "Aurora Retail", plan: "Growth", billing: "Annual", startMonth: 0, active: true, mrrChange: { month: 5, delta: 200, kind: "expansion" } },
  { id: 2, name: "Beacon Health", plan: "Enterprise", billing: "Annual", startMonth: 0, active: true, mrrChange: { month: 6, delta: -300, kind: "contraction" } },
  { id: 5, name: "Everest Fintech", plan: "Enterprise", billing: "Annual", startMonth: 3, active: true },
  { id: 6, name: "Fjord Media", plan: "Growth", billing: "Annual", startMonth: 4, active: true },
  { id: 7, name: "Glacier Foods", plan: "Starter", billing: "Monthly", startMonth: 5, active: false, churnMonth: 9 },
  { id: 8, name: "Harbour Analytics", plan: "Enterprise", billing: "Monthly", startMonth: 6, active: true },
  { id: 9, name: "Iron Systems", plan: "Growth", billing: "Annual", startMonth: 7, active: true },
  { id: 10, name: "Juniper SaaS", plan: "Starter", billing: "Annual", startMonth: 8, active: true },
  { id: 11, name: "Kestrel Robotics", plan: "Growth", billing: "Annual", startMonth: 1, active: false, churnMonth: 7, churnType: "forfeit" },
  { id: 12, name: "Larch Biotech", plan: "Enterprise", billing: "Annual", startMonth: 2, active: false, churnMonth: 8, churnType: "refund" },
  { id: 13, name: "Meridian Data", plan: "Usage", billing: "Usage", startMonth: 2, active: true },
  { id: 14, name: "Nimbus Networks", plan: "Hybrid", billing: "Usage", startMonth: 3, active: true },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Contract repository — signed PDF filenames (stored alongside this dashboard in /contracts)
const CONTRACT_FILES = [
  { id: "NB-2025-001", cust: "Aurora Retail", file: "/contracts/01_Aurora_Retail.pdf" },
  { id: "NB-2025-001-A", cust: "Aurora Retail — Amendment (upsell)", file: "/contracts/01_Aurora_Retail_Amendment.pdf" },
  { id: "NB-2025-002", cust: "Beacon Health", file: "/contracts/02_Beacon_Health.pdf" },
  { id: "NB-2025-002-A", cust: "Beacon Health — Amendment (downgrade)", file: "/contracts/02_Beacon_Health_Amendment.pdf" },
  { id: "NB-2025-005", cust: "Everest Fintech", file: "/contracts/05_Everest_Fintech.pdf" },
  { id: "NB-2025-006", cust: "Fjord Media", file: "/contracts/06_Fjord_Media.pdf" },
  { id: "NB-2025-007", cust: "Glacier Foods", file: "/contracts/07_Glacier_Foods.pdf" },
  { id: "NB-2025-008", cust: "Harbour Analytics", file: "/contracts/08_Harbour_Analytics.pdf" },
  { id: "NB-2025-009", cust: "Iron Systems", file: "/contracts/09_Iron_Systems.pdf" },
  { id: "NB-2025-010", cust: "Juniper SaaS", file: "/contracts/10_Juniper_SaaS.pdf" },
  { id: "NB-2025-011", cust: "Kestrel Robotics", file: "/contracts/11_Kestrel_Robotics.pdf" },
  { id: "NB-2025-011-T", cust: "Kestrel Robotics — Termination", file: "/contracts/11_Kestrel_Robotics_Termination.pdf" },
  { id: "NB-2025-012", cust: "Larch Biotech", file: "/contracts/12_Larch_Biotech.pdf" },
  { id: "NB-2025-012-T", cust: "Larch Biotech — Termination", file: "/contracts/12_Larch_Biotech_Termination.pdf" },
  { id: "NB-2025-013", cust: "Meridian Data", file: "/contracts/13_Meridian_Data.pdf" },
  { id: "NB-2025-014", cust: "Nimbus Networks", file: "/contracts/14_Nimbus_Networks.pdf" },
];
const cad = (n) => "$" + Math.round(n).toLocaleString("en-CA");
const cadK = (n) => "$" + (n / 1000).toFixed(1) + "K";

// Annual contract value for a subscription customer: custom value if set, else the plan rate-card price.
// This lets each customer carry a negotiated / discounted amount rather than a standard plan price.
function annualOf(c) {
  return c.annualValue != null ? c.annualValue : (PLAN_PRICES[c.plan] || 0);
}

// Contract/annual value for display. Usage customers show annualized (fixed×12 + total usage).
function contractValue(c) {
  if (c.billing === "Usage") {
    const p = c.usageProfile || USAGE_PROFILES[c.name] || { fixedMonthly: 0, usage: [] };
    const usageTotal = (p.usage || []).reduce((s, v) => s + (v || 0), 0);
    return (p.fixedMonthly || 0) * 12 + usageTotal;
  }
  return annualOf(c);
}

// ── Core accounting engine ──────────────────────────────────────────
// Returns a 12-month model of bookings, deferred revenue, recognized revenue, MRR/ARR
function buildModel(customers) {
  const months = Array.from({ length: 12 }, (_, m) => ({
    month: MONTHS[m],
    idx: m,
    recognized: 0,
    newBookings: 0,
    deferredEnd: 0,
    mrr: 0,
    activeCount: 0,
    churnedMRR: 0,
  }));

  // Track each customer's remaining deferred balance
  customers.forEach((c) => {
    const endMonth = c.active ? 12 : (c.churnMonth ?? 12);

    // ── Usage-based billing (pure or hybrid) ──
    // Revenue recognized as usage is consumed; billed in arrears; no deferred revenue.
    if (c.billing === "Usage") {
      const profile = c.usageProfile || USAGE_PROFILES[c.name] || { fixedMonthly: 0, usage: Array(12).fill(0) };
      for (let m = c.startMonth; m < 12; m++) {
        if (m >= endMonth) break;
        const usageRev = profile.usage[m] || 0;
        const fixed = profile.fixedMonthly || 0;
        const monthTotal = usageRev + fixed;
        if (monthTotal <= 0) continue;
        months[m].recognized += monthTotal;
        months[m].usageRevenue = (months[m].usageRevenue || 0) + usageRev;
        months[m].fixedRevenue = (months[m].fixedRevenue || 0) + fixed;
        // Usage is billed in arrears → recognized = booked in the same month
        months[m].newBookings += monthTotal;
        // MRR proxy for usage: include only the recurring fixed portion; usage is variable
        months[m].mrr += fixed;
        months[m].activeCount += 1;
      }
      return; // usage customers don't touch subscription/deferred logic
    }

    // ── Subscription billing (annual or monthly) ──
    const annual = annualOf(c);
    const monthlyRev = annual / 12;

    let monthsServed = 0;
    for (let m = c.startMonth; m < 12; m++) {
      if (m >= endMonth) break;

      // Recognized revenue this month (straight-line over service period)
      months[m].recognized += monthlyRev;
      months[m].mrr += monthlyRev;
      // Expansion / contraction changes BOTH the recurring MRR run-rate AND recognized revenue
      // from the event month onward. How it interacts with deferred depends on billing type.
      if (c.mrrChange && m >= c.mrrChange.month) {
        const delta = c.mrrChange.delta;
        months[m].mrr += delta;
        months[m].recognized += delta;
        if (c.billing === "Annual") {
          // Annual prepaid: the reduced/increased service changes recognition, but the original
          // cash was already collected. For a contraction, the excess prepaid is refunded once
          // (handled below at the event month). For an expansion, the incremental is billed
          // monthly as new bookings (added to deferred and immediately recognized).
          if (delta > 0) months[m].newBookings += delta;
        } else {
          // Monthly billing: incremental is simply billed/recognized each month.
          months[m].newBookings += delta;
        }
      }
      months[m].activeCount += 1;
      monthsServed += 1;

      // Bookings & deferred logic (base subscription)
      if (c.billing === "Annual") {
        if ((m - c.startMonth) % 12 === 0) {
          months[m].newBookings += annual;
        }
      } else {
        months[m].newBookings += monthlyRev;
      }
    }

    // Annual contraction: refund the excess prepaid at the event month so deferred fully unwinds.
    // The customer prepaid at the original rate; after downgrade they consume less, so the
    // over-paid portion for the remaining months is returned as cash (Dr Deferred / Cr Cash).
    if (c.mrrChange && c.billing === "Annual" && c.mrrChange.delta < 0 && c.active) {
      const evt = c.mrrChange.month;
      const monthsRemaining = 12 - (evt - c.startMonth); // months from event to end of term
      const refundExcess = (-c.mrrChange.delta) * monthsRemaining;
      if (refundExcess > 0) {
        months[evt].refundPaid = (months[evt].refundPaid || 0) + refundExcess;
      }
    }

    // Churn tracking
    if (!c.active && c.churnMonth != null && c.churnMonth < 12) {
      months[c.churnMonth].churnedMRR += monthlyRev;

      // Annual contract churning mid-term leaves an unearned (deferred) balance.
      // That balance must be cleared at churn.
      if (c.billing === "Annual") {
        const remainingDeferred = Math.max(0, annual - monthsServed * monthlyRev);
        if (c.churnType === "forfeit") {
          // No refund: remaining deferred is released to revenue (one-time bump)
          months[c.churnMonth].recognized += remainingDeferred;
          months[c.churnMonth].forfeitRevenue = (months[c.churnMonth].forfeitRevenue || 0) + remainingDeferred;
        } else if (c.churnType === "refund") {
          // Refund: deferred is paid back to the customer (cash out, no revenue)
          months[c.churnMonth].refundPaid = (months[c.churnMonth].refundPaid || 0) + remainingDeferred;
        }
      }
    }
  });

  // Deferred revenue rollforward: deferred = cumulative(bookings - recognized - refunds)
  // Forfeit is already handled via extra recognized revenue above.
  // Refund reduces deferred without going through revenue, so subtract it here.
  let deferredBal = 0;
  months.forEach((row) => {
    deferredBal += row.newBookings - row.recognized - (row.refundPaid || 0);
    if (deferredBal < 0) deferredBal = 0;
    row.deferredEnd = deferredBal;
    row.arr = row.mrr * 12;
    // Split recognized revenue into subscription vs usage for the revenue-mix chart
    row.usageRev = row.usageRevenue || 0;
    row.subscriptionRev = Math.max(0, row.recognized - row.usageRev);
  });

  // Net revenue retention (simple proxy): current MRR vs MRR 12mo — using churn
  return months;
}

// ── Journal entry builder for a given month ─────────────────────────
// Produces the Dr/Cr lines an accountant would actually book.
function buildJournalEntries(customers, monthIdx) {
  const entries = [];
  customers.forEach((c) => {
    const endMonth = c.active ? 12 : (c.churnMonth ?? 12);
    const isChurnMonth = !c.active && c.churnMonth === monthIdx;
    const inService = monthIdx >= c.startMonth && monthIdx < endMonth;

    // ── Usage-based billing entries ──
    if (c.billing === "Usage") {
      if (inService) {
        const profile = c.usageProfile || USAGE_PROFILES[c.name] || { fixedMonthly: 0, usage: Array(12).fill(0) };
        const usageRev = profile.usage[monthIdx] || 0;
        const fixed = profile.fixedMonthly || 0;
        // Fixed platform fee (hybrid): recognized straight-line, billed monthly
        if (fixed > 0) {
          entries.push({
            customer: c.name, type: "Platform fee (fixed, monthly)",
            lines: [
              { account: "Accounts Receivable", dr: fixed, cr: 0 },
              { account: "Subscription Revenue", dr: 0, cr: fixed },
            ],
          });
        }
        // Usage recognized as consumed, billed in arrears → unbilled receivable
        if (usageRev > 0) {
          entries.push({
            customer: c.name, type: "Usage revenue (billed in arrears)",
            lines: [
              { account: "Unbilled Receivable", dr: usageRev, cr: 0 },
              { account: "Usage Revenue", dr: 0, cr: usageRev },
            ],
          });
        }
      }
      return; // usage customers skip subscription/churn logic
    }

    const annual = annualOf(c);
    const monthlyRev = annual / 12;

    if (inService) {
      const isAnniversary = (monthIdx - c.startMonth) % 12 === 0;
      // Effective recognition this month, reflecting any expansion/contraction in force
      const changeActive = c.mrrChange && monthIdx >= c.mrrChange.month;
      const effectiveMonthly = monthlyRev + (changeActive ? c.mrrChange.delta : 0);
      if (c.billing === "Annual") {
        if (isAnniversary) {
          entries.push({
            customer: c.name, type: "Billing (annual invoice)",
            lines: [
              { account: "Accounts Receivable", dr: annual, cr: 0 },
              { account: "Deferred Revenue", dr: 0, cr: annual },
            ],
          });
        }
        // Recognition releases deferred at the effective (post-change) monthly rate
        entries.push({
          customer: c.name, type: "Revenue recognition",
          lines: [
            { account: "Deferred Revenue", dr: effectiveMonthly, cr: 0 },
            { account: "Subscription Revenue", dr: 0, cr: effectiveMonthly },
          ],
        });
        // At the downgrade month, refund the excess prepaid for the remaining reduced months
        if (changeActive && c.mrrChange.delta < 0 && monthIdx === c.mrrChange.month) {
          const monthsRemaining = 12 - (c.mrrChange.month - c.startMonth);
          const refundExcess = (-c.mrrChange.delta) * monthsRemaining;
          if (refundExcess > 0) {
            entries.push({
              customer: c.name, type: "Downgrade — refund excess prepaid",
              lines: [
                { account: "Deferred Revenue", dr: refundExcess, cr: 0 },
                { account: "Cash", dr: 0, cr: refundExcess },
              ],
            });
          }
        }
        // At an upsell month on annual, the incremental is billed and recognized monthly
        if (changeActive && c.mrrChange.delta > 0) {
          entries.push({
            customer: c.name, type: "Expansion (upsell, incremental)",
            lines: [
              { account: "Accounts Receivable", dr: c.mrrChange.delta, cr: 0 },
              { account: "Subscription Revenue", dr: 0, cr: c.mrrChange.delta },
            ],
          });
        }
      } else {
        // Monthly billing: bill & recognize the effective amount together
        entries.push({
          customer: c.name, type: "Billing + recognition (monthly)",
          lines: [
            { account: "Accounts Receivable", dr: effectiveMonthly, cr: 0 },
            { account: "Subscription Revenue", dr: 0, cr: effectiveMonthly },
          ],
        });
      }
    }

    // Churn entry for annual contracts: clear the remaining deferred balance.
    if (isChurnMonth && c.billing === "Annual") {
      const monthsServed = Math.max(0, c.churnMonth - c.startMonth);
      const remainingDeferred = Math.max(0, annual - monthsServed * monthlyRev);
      if (remainingDeferred > 0) {
        if (c.churnType === "forfeit") {
          // No refund — release remaining deferred to revenue
          entries.push({
            customer: c.name, type: "Churn — forfeit (release deferred to revenue)",
            lines: [
              { account: "Deferred Revenue", dr: remainingDeferred, cr: 0 },
              { account: "Subscription Revenue", dr: 0, cr: remainingDeferred },
            ],
          });
        } else if (c.churnType === "refund") {
          // Refund — pay remaining deferred back to customer (no revenue)
          entries.push({
            customer: c.name, type: "Churn — refund (repay deferred)",
            lines: [
              { account: "Deferred Revenue", dr: remainingDeferred, cr: 0 },
              { account: "Cash / Refund Payable", dr: 0, cr: remainingDeferred },
            ],
          });
        }
      }
    }
  });
  return entries;
}

// Summarize into separate Dr and Cr lines. An account like Deferred Revenue
// that is both debited (recognition) and credited (billing) shows TWO lines.
function summarizeEntries(entries) {
  const map = {};
  entries.forEach((e) => e.lines.forEach((l) => {
    if (!map[l.account]) map[l.account] = { account: l.account, dr: 0, cr: 0 };
    map[l.account].dr += l.dr;
    map[l.account].cr += l.cr;
  }));
  const order = ["Accounts Receivable", "Unbilled Receivable", "Deferred Revenue", "Subscription Revenue", "Usage Revenue", "Cash / Refund Payable"];
  const rows = [];
  Object.values(map)
    .sort((a, b) => order.indexOf(a.account) - order.indexOf(b.account))
    .forEach((acc) => {
      // Emit a separate row for the debit side and the credit side
      if (acc.dr > 0) rows.push({ account: acc.account, side: "Dr", amount: acc.dr });
      if (acc.cr > 0) rows.push({ account: acc.account, side: "Cr", amount: acc.cr });
    });
  return rows;
}

// ── UI Components ───────────────────────────────────────────────────
function Stat({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10,
      padding: "16px 18px", flex: 1, minWidth: 150,
    }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "#667085", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || "#0B2B4E", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function App() {
  const [customers, setCustomers] = useState(SEED);
  const [form, setForm] = useState({ name: "", plan: "Growth", billing: "Annual", startMonth: 0, amount: "", discountPct: "" });
  const [viewMonth, setViewMonth] = useState(11);

  const model = useMemo(() => buildModel(customers), [customers]);
  const current = model[viewMonth];
  const prev = viewMonth > 0 ? model[viewMonth - 1] : null;

  const totalDeferred = current.deferredEnd;
  const arr = current.arr;
  const mrr = current.mrr;
  const activeCustomers = current.activeCount;

  // ── Point-in-time churn: only count churn that has happened through the selected month ──
  const grossChurn = model.reduce((s, m, i) => i <= viewMonth ? s + m.churnedMRR : s, 0);

  // ── Cohort-based Net Revenue Retention (as of the selected month) ──
  // Take the cohort of customers active at the start of the year (month 0, January), measure
  // their starting recurring MRR, then apply expansion, contraction, and churn that has
  // occurred for THAT cohort through the selected month. Usage customers count only their
  // recurring fixed fee (variable usage is excluded from MRR).
  const nrrData = useMemo(() => {
    const monthlyOf = (c) => {
      if (c.billing === "Usage") {
        const p = c.usageProfile || USAGE_PROFILES[c.name] || { fixedMonthly: 0 };
        return p.fixedMonthly || 0;
      }
      return annualOf(c) / 12;
    };
    // Cohort = customers whose service had started by month 0 (active in January)
    const cohort = customers.filter((c) => c.startMonth === 0);
    let startingMRR = 0, expansion = 0, contraction = 0, churn = 0;
    cohort.forEach((c) => {
      const base = monthlyOf(c);
      startingMRR += base;
      if (!c.active && c.churnMonth != null && c.churnMonth <= viewMonth) {
        churn += base; // this cohort member has churned as of the selected month
      } else if (c.mrrChange && c.mrrChange.month <= viewMonth) {
        if (c.mrrChange.delta >= 0) expansion += c.mrrChange.delta;
        else contraction += -c.mrrChange.delta;
      }
    });
    const endingMRR = startingMRR + expansion - contraction - churn;
    const nrr = startingMRR > 0 ? (endingMRR / startingMRR) * 100 : 100;
    return { startingMRR, expansion, contraction, churn, endingMRR, nrr };
  }, [customers, viewMonth]);
  const nrr = nrrData.nrr;

  const journalEntries = useMemo(() => buildJournalEntries(customers, viewMonth), [customers, viewMonth]);
  const jeSummary = useMemo(() => summarizeEntries(journalEntries), [journalEntries]);
  const jeTotals = jeSummary.reduce(
    (t, r) => ({ dr: t.dr + (r.side === "Dr" ? r.amount : 0), cr: t.cr + (r.side === "Cr" ? r.amount : 0) }),
    { dr: 0, cr: 0 }
  );
  const balanced = Math.abs(jeTotals.dr - jeTotals.cr) < 0.01;

  // Reconciliation: recognized revenue per month from the model (the sub-ledger / "should be")
  // vs. actual posted revenue uploaded from accounting software CSV (the GL / "is").
  const [postedByMonth, setPostedByMonth] = useState({}); // { monthIdx: amount }
  const [uploadMsg, setUploadMsg] = useState("");

  const handlePostedUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target.result);
        const rows = text.split(/\r?\n/).filter((l) => l.trim());
        if (rows.length < 2) { setUploadMsg("File looks empty."); return; }

        // Split respecting simple quoted cells
        const splitRow = (line) => {
          const out = []; let cur = ""; let q = false;
          for (const ch of line) {
            if (ch === '"') q = !q;
            else if (ch === "," && !q) { out.push(cur); cur = ""; }
            else cur += ch;
          }
          out.push(cur);
          return out.map((c) => c.trim());
        };

        const header = splitRow(rows[0]).map((h) => h.toLowerCase());
        const find = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));

        // Detect ERP-style export (has posting period + debit + credit + account)
        const periodCol = find("posting period", "postingperiod", "period", "month");
        const debitCol = find("debit");
        const creditCol = find("credit");
        const accountCol = find("account");
        const revenueCol = find("revenue", "amount"); // simple format fallback

        // Parse a period string like "Jan 2025", "January 2025", "2025-01", "Jan" -> month index 0-11
        const FULL = ["january","february","march","april","may","june","july","august","september","october","november","december"];
        const toMonthIdx = (raw) => {
          if (!raw) return -1;
          const s = String(raw).toLowerCase();
          for (let m = 0; m < 12; m++) {
            if (s.includes(MONTHS[m].toLowerCase()) || s.includes(FULL[m])) return m;
          }
          const iso = s.match(/\d{4}[-/](\d{1,2})/); // 2025-01
          if (iso) return parseInt(iso[1], 10) - 1;
          return -1;
        };
        const num = (v) => {
          const n = parseFloat(String(v).replace(/[$,()]/g, "").trim());
          return isNaN(n) ? 0 : n;
        };

        const map = {};
        let mode = "";

        if (periodCol >= 0 && creditCol >= 0 && debitCol >= 0) {
          // ERP mode: recognized revenue = net credit to the Subscription Revenue account.
          // (Rev rec credits revenue; contra/reversals debit it. Net = Credit - Debit on that account.)
          mode = "ERP-format export";
          for (let i = 1; i < rows.length; i++) {
            const c = splitRow(rows[i]);
            const mIdx = toMonthIdx(c[periodCol]);
            if (mIdx < 0) continue;
            const acct = accountCol >= 0 ? String(c[accountCol]).toLowerCase() : "revenue";
            // Only count revenue accounts (skip AR, deferred, cash lines)
            const isRevenue = acct.includes("revenue") && !acct.includes("deferred");
            if (accountCol >= 0 && !isRevenue) continue;
            const credit = num(c[creditCol]);
            const debit = num(c[debitCol]);
            map[mIdx] = (map[mIdx] || 0) + credit - debit;
          }
        } else {
          // Simple mode: Month + Revenue/Amount columns
          mode = "simple format";
          const mCol = periodCol >= 0 ? periodCol : 0;
          const aCol = revenueCol >= 0 ? revenueCol : (creditCol >= 0 ? creditCol : 1);
          for (let i = 1; i < rows.length; i++) {
            const c = splitRow(rows[i]);
            const mIdx = toMonthIdx(c[mCol]);
            const amt = num(c[aCol]);
            if (mIdx >= 0 && amt) map[mIdx] = (map[mIdx] || 0) + amt;
          }
        }

        // Round to cents
        Object.keys(map).forEach((k) => { map[k] = Math.round(map[k] * 100) / 100; });

        if (Object.keys(map).length === 0) {
          setUploadMsg("Couldn't find usable rows. For an ERP-format export: include Posting Period, Account, Debit, Credit. For simple files: Month, Revenue.");
        } else {
          setPostedByMonth(map);
          setUploadMsg(`Loaded ${Object.keys(map).length} month(s) from ${mode}.`);
        }
      } catch {
        setUploadMsg("Couldn't parse that CSV. Check the column headers and try again.");
      }
    };
    reader.readAsText(file);
  };

  const loadSimulatedPosted = () => {
    // Simulate what accounting software posted: mostly matches, with two seeded variances
    const map = {};
    model.forEach((row, i) => {
      let posted = row.recognized;
      if (i === 3) posted = row.recognized - 400;   // April: a contract booked late in GL
      if (i === 9) posted = row.recognized + 100;    // Oct: a manual top-up posted in error
      map[i] = Math.round(posted * 100) / 100;
    });
    setPostedByMonth(map);
    setUploadMsg("Loaded simulated posted figures (two variances seeded for demonstration).");
  };

  const clearPosted = () => { setPostedByMonth({}); setUploadMsg(""); };

  // Reconciliation totals across all months that have a posted figure
  const reconTotals = useMemo(() => {
    let model_ = 0, posted_ = 0, monthsWithData = 0, flaggedCount = 0;
    model.forEach((row, i) => {
      if (postedByMonth[i] != null) {
        model_ += row.recognized;
        posted_ += postedByMonth[i];
        monthsWithData += 1;
        if (Math.abs(postedByMonth[i] - row.recognized) >= 0.01) flaggedCount += 1;
      }
    });
    return { model: model_, posted: posted_, variance: posted_ - model_, monthsWithData, flaggedCount };
  }, [model, postedByMonth]);

  const exportJE = () => {
    const rows = [["Month", "Customer", "Entry type", "Account", "Debit (CAD)", "Credit (CAD)"]];
    journalEntries.forEach((e) => e.lines.forEach((l) => {
      rows.push([MONTHS[viewMonth], e.customer, e.type, l.account, l.dr ? l.dr.toFixed(2) : "", l.cr ? l.cr.toFixed(2) : ""]);
    }));
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-entries-${MONTHS[viewMonth]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addCustomer = () => {
    if (!form.name.trim()) return;
    const start = Number(form.startMonth);
    const isUsage = form.billing === "Usage";
    const discount = Math.max(0, Math.min(100, parseFloat(form.discountPct) || 0)) / 100;
    const rawAmount = parseFloat(form.amount);
    const hasAmount = !isNaN(rawAmount) && rawAmount > 0;

    let usageProfile;
    let annualValue;

    if (isUsage) {
      // For usage, the amount field means "average monthly usage". Build a flat profile at that level.
      const monthlyUsage = hasAmount ? rawAmount : 2000; // default if left blank
      const usage = Array(12).fill(0);
      for (let m = start; m < 12; m++) {
        // apply discount to the usage rate if given
        usage[m] = Math.round(monthlyUsage * (1 - discount));
      }
      usageProfile = { fixedMonthly: form.plan === "Hybrid" ? 800 : 0, usage };
    } else {
      // Subscription: amount is the annual value for Annual, or the monthly value for Monthly.
      // Store internally as an annual value (the model divides by 12).
      const entered = hasAmount ? rawAmount : (PLAN_PRICES[form.plan] || 0);
      const base = form.billing === "Monthly" && hasAmount ? entered * 12 : entered;
      annualValue = Math.round(base * (1 - discount));
    }

    setCustomers([...customers, {
      id: Date.now(), name: form.name.trim(),
      plan: isUsage ? (form.plan === "Hybrid" ? "Hybrid" : "Usage") : form.plan,
      billing: form.billing, startMonth: start, active: true,
      ...(annualValue != null ? { annualValue } : {}),
      ...(usageProfile ? { usageProfile } : {}),
    }]);
    setForm({ name: "", plan: "Growth", billing: "Annual", startMonth: 0, amount: "", discountPct: "" });
  };

  const churnCustomer = (id) => {
    setCustomers(customers.map((c) => c.id === id
      ? { ...c, active: false, churnMonth: viewMonth, churnType: c.billing === "Annual" ? (c.churnType || "forfeit") : undefined }
      : c));
  };

  const setChurnType = (id, type) => {
    setCustomers(customers.map((c) => c.id === id ? { ...c, churnType: type } : c));
  };

  const removeCustomer = (id) => setCustomers(customers.filter((c) => c.id !== id));

  const inputStyle = {
    padding: "8px 10px", border: "1px solid #D0D5DD", borderRadius: 8,
    fontSize: 13, fontFamily: "inherit", color: "#1D2939", background: "#fff",
  };

  return (
    <div style={{
      fontFamily: "'Inter', system-ui, sans-serif", background: "#F7F8FA",
      minHeight: "100vh", padding: "28px 24px", color: "#1D2939",
    }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#1570EF", fontWeight: 700 }}>Northbound · Revenue Accounting</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "4px 0 0", color: "#0B2B4E" }}>SaaS Deferred Revenue & Metrics Dashboard</h1>
            <div style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>ASC 606 straight-line recognition · All figures in CAD</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", padding: "8px 12px", borderRadius: 8, border: "1px solid #E4E7EC" }}>
            <span style={{ fontSize: 12, color: "#667085", fontWeight: 600 }}>Reporting month</span>
            <select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))} style={{ ...inputStyle, padding: "5px 8px" }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m} (M{i + 1})</option>)}
            </select>
          </div>
        </div>

        {/* Stat row */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <Stat label="ARR" value={cad(arr)} sub={prev ? `${arr >= prev.arr ? "▲" : "▼"} vs last month` : "—"} accent="#0B2B4E" />
          <Stat label="MRR" value={cad(mrr)} sub={`${activeCustomers} active customers`} accent="#1570EF" />
          <Stat label="Deferred Revenue" value={cad(totalDeferred)} sub="Balance sheet liability" accent="#7A5AF8" />
          <Stat label="Recognized (this mo.)" value={cad(current.recognized)} sub="P&L revenue" accent="#12B76A" />
          <Stat label="Usage Rev. (this mo.)" value={cad(current.usageRev || 0)} sub="Variable, billed in arrears" accent="#F79009" />
          <Stat label="Net Rev. Retention" value={nrr.toFixed(0) + "%"} sub={`Jan cohort, as of ${MONTHS[viewMonth]}`} accent={nrr >= 100 ? "#12B76A" : "#F04438"} />
        </div>

        {/* NRR cohort breakdown */}
        <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E" }}>Net Revenue Retention — cohort walk</div>
            <div style={{ fontSize: 12, color: "#98A2B3" }}>Customers active in January, tracked through {MONTHS[viewMonth]}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "stretch" }}>
            {[
              { label: "Starting MRR", val: nrrData.startingMRR, color: "#0B2B4E", sign: "" },
              { label: "+ Expansion", val: nrrData.expansion, color: "#12B76A", sign: "+" },
              { label: "− Contraction", val: nrrData.contraction, color: "#F79009", sign: "−" },
              { label: "− Churn", val: nrrData.churn, color: "#F04438", sign: "−" },
              { label: "= Ending MRR", val: nrrData.endingMRR, color: "#1570EF", sign: "" },
            ].map((b, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 110, padding: "12px 14px", borderRadius: 8,
                background: "#F7F8FA", border: "1px solid #E4E7EC",
              }}>
                <div style={{ fontSize: 11, color: "#667085", fontWeight: 600 }}>{b.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: b.color, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                  {b.sign}{cad(b.val)}
                </div>
              </div>
            ))}
            <div style={{
              flex: 1, minWidth: 110, padding: "12px 14px", borderRadius: 8,
              background: nrr >= 100 ? "#ECFDF3" : "#FEF3F2", border: "1px solid " + (nrr >= 100 ? "#A6F4C5" : "#FECDCA"),
            }}>
              <div style={{ fontSize: 11, color: "#667085", fontWeight: 600 }}>NRR</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: nrr >= 100 ? "#027A48" : "#B42318", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {nrr.toFixed(0)}%
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 10, lineHeight: 1.6 }}>
            NRR = (Starting MRR + Expansion − Contraction − Churn) ÷ Starting MRR, measured on the cohort of customers active in January and reflecting only events that have occurred through {MONTHS[viewMonth]}. Only recurring MRR counts (subscriptions and fixed platform fees); variable usage is excluded. Point-in-time: future churn or expansion does not appear until the month it happens.
          </div>
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          {/* Deferred revenue waterfall */}
          <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E", marginBottom: 2 }}>Deferred Revenue Rollforward</div>
            <div style={{ fontSize: 12, color: "#98A2B3", marginBottom: 12 }}>Bookings build the liability; recognition unwinds it</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={model}>
                <defs>
                  <linearGradient id="def" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7A5AF8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#7A5AF8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#667085" }} />
                <YAxis tickFormatter={cadK} tick={{ fontSize: 11, fill: "#667085" }} width={48} />
                <Tooltip formatter={(v) => cad(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E4E7EC" }} />
                <Area type="monotone" dataKey="deferredEnd" name="Deferred balance" stroke="#7A5AF8" strokeWidth={2} fill="url(#def)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Recognized vs bookings */}
          <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E", marginBottom: 2 }}>Bookings vs. Recognized Revenue</div>
            <div style={{ fontSize: 12, color: "#98A2B3", marginBottom: 12 }}>Cash-in timing vs. P&L revenue timing</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={model}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#667085" }} />
                <YAxis tickFormatter={cadK} tick={{ fontSize: 11, fill: "#667085" }} width={48} />
                <Tooltip formatter={(v) => cad(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E4E7EC" }} />
                <Bar dataKey="newBookings" name="Bookings" fill="#1570EF" radius={[3, 3, 0, 0]} />
                <Bar dataKey="recognized" name="Recognized" fill="#12B76A" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ARR trend */}
        <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E", marginBottom: 2 }}>ARR Growth</div>
          <div style={{ fontSize: 12, color: "#98A2B3", marginBottom: 12 }}>Annual recurring revenue by month</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={model}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#667085" }} />
              <YAxis tickFormatter={cadK} tick={{ fontSize: 11, fill: "#667085" }} width={48} />
              <Tooltip formatter={(v) => cad(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E4E7EC" }} />
              <Line type="monotone" dataKey="arr" name="ARR" stroke="#0B2B4E" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue mix: subscription vs usage */}
        <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E", marginBottom: 2 }}>Recognized Revenue Mix — Subscription vs. Usage</div>
          <div style={{ fontSize: 12, color: "#98A2B3", marginBottom: 12 }}>Subscription recognizes evenly; usage varies with consumption and is billed in arrears</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={model}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#667085" }} />
              <YAxis tickFormatter={cadK} tick={{ fontSize: 11, fill: "#667085" }} width={48} />
              <Tooltip formatter={(v) => cad(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E4E7EC" }} />
              <Bar dataKey="subscriptionRev" name="Subscription" stackId="rev" fill="#1570EF" radius={[0, 0, 0, 0]} />
              <Bar dataKey="usageRev" name="Usage" stackId="rev" fill="#F79009" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 8 }}>
            Usage revenue (amber) has no deferred balance — it's recognized as consumed. Subscription revenue (blue) comes from annual and monthly contracts recognized straight-line.
          </div>
        </div>

        {/* Customer management */}
        <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E", marginBottom: 4 }}>Customer Contracts — adjust to see the model recalculate</div>
          <div style={{ fontSize: 12, color: "#98A2B3", marginBottom: 12 }}>Showing customers active as of {MONTHS[viewMonth]} — contracts starting later appear when you advance the reporting month.</div>

          {/* Add form */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8, padding: 12, background: "#F7F8FA", borderRadius: 8 }}>
            <input placeholder="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 130 }} />
            <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} style={inputStyle}>
              {Object.keys(PLAN_PRICES).map((p) => <option key={p}>{p}</option>)}
              {form.billing === "Usage" && <option>Hybrid</option>}
            </select>
            <select value={form.billing} onChange={(e) => setForm({ ...form, billing: e.target.value })} style={inputStyle}>
              <option>Annual</option><option>Monthly</option><option>Usage</option>
            </select>
            <input
              type="number" min="0"
              placeholder={form.billing === "Usage" ? "Avg usage/mo ($)" : form.billing === "Monthly" ? "Monthly value ($)" : "Annual value ($)"}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              style={{ ...inputStyle, width: 130 }}
              title={form.billing === "Usage"
                ? "Average monthly usage in CAD. Leave blank for a default."
                : form.billing === "Monthly"
                ? "Monthly contract value in CAD. Leave blank to use the standard plan price (÷12)."
                : "Annual contract value in CAD. Leave blank to use the standard plan price."}
            />
            <input
              type="number" min="0" max="100"
              placeholder="Disc %"
              value={form.discountPct}
              onChange={(e) => setForm({ ...form, discountPct: e.target.value })}
              style={{ ...inputStyle, width: 78 }}
              title="Optional discount percentage applied to the value above"
            />
            <select value={form.startMonth} onChange={(e) => setForm({ ...form, startMonth: e.target.value })} style={inputStyle}>
              {MONTHS.map((m, i) => <option key={i} value={i}>Starts {m}</option>)}
            </select>
            <button onClick={addCustomer} style={{
              padding: "8px 16px", background: "#1570EF", color: "#fff", border: "none",
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>+ Add contract</button>
          </div>
          <div style={{ fontSize: 11, color: "#98A2B3", marginBottom: 16, paddingLeft: 2 }}>
            Enter the negotiated {form.billing === "Usage" ? "average monthly usage" : form.billing === "Monthly" ? "monthly contract value" : "annual contract value"} — or leave it blank to use the standard {form.plan} price. Add an optional discount %. Values need not be standard across customers.
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#667085", borderBottom: "1px solid #E4E7EC" }}>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Plan</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Billing</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Annual value</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Start</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}></th>
                </tr>
              </thead>
              <tbody>
                {customers.filter((c) => c.startMonth <= viewMonth).map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #F0F1F3" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1D2939" }}>{c.name}</td>
                    <td style={{ padding: "8px 10px" }}>{c.plan}</td>
                    <td style={{ padding: "8px 10px" }}>{c.billing}</td>
                    <td style={{ padding: "8px 10px", fontVariantNumeric: "tabular-nums" }}>
                      {cad(contractValue(c))}
                      {c.billing === "Usage" && <span style={{ fontSize: 10, color: "#98A2B3", marginLeft: 4 }}>est.</span>}
                    </td>
                    <td style={{ padding: "8px 10px" }}>{MONTHS[c.startMonth]}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {(() => {
                        const churnedAsOf = !c.active && c.churnMonth != null && c.churnMonth <= viewMonth;
                        const notYetStarted = c.startMonth > viewMonth;
                        const label = notYetStarted ? `Starts M${c.startMonth + 1}`
                          : churnedAsOf ? `Churned M${(c.churnMonth ?? 0) + 1}` : "Active";
                        const bg = churnedAsOf ? "#FEF3F2" : notYetStarted ? "#F2F4F7" : "#ECFDF3";
                        const fg = churnedAsOf ? "#B42318" : notYetStarted ? "#667085" : "#027A48";
                        return (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                            background: bg, color: fg,
                          }}>{label}</span>
                        );
                      })()}
                      {(!c.active && c.churnMonth != null && c.churnMonth <= viewMonth) && c.billing === "Annual" && (
                        <div style={{ marginTop: 5, display: "inline-flex", gap: 4 }}>
                          {["forfeit", "refund"].map((t) => (
                            <button key={t} onClick={() => setChurnType(c.id, t)} style={{
                              fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
                              fontFamily: "inherit", textTransform: "capitalize",
                              border: "1px solid " + (c.churnType === t ? "#7A5AF8" : "#D0D5DD"),
                              background: c.churnType === t ? "#F4F3FF" : "#fff",
                              color: c.churnType === t ? "#7A5AF8" : "#98A2B3",
                            }}>{t}</button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      {c.active && (
                        <button onClick={() => churnCustomer(c.id)} title="Mark churned this month" style={{
                          border: "1px solid #D0D5DD", background: "#fff", borderRadius: 6, padding: "3px 8px",
                          fontSize: 12, color: "#B42318", cursor: "pointer", marginRight: 6, fontFamily: "inherit",
                        }}>Churn</button>
                      )}
                      <button onClick={() => removeCustomer(c.id)} title="Delete" style={{
                        border: "1px solid #D0D5DD", background: "#fff", borderRadius: 6, padding: "3px 8px",
                        fontSize: 12, color: "#667085", cursor: "pointer", fontFamily: "inherit",
                      }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Journal Entries */}
        <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E" }}>Journal Entries — {MONTHS[viewMonth]} (M{viewMonth + 1})</div>
              <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 2 }}>The actual debits and credits an accountant books this period</div>
            </div>
            <button onClick={exportJE} style={{
              padding: "8px 14px", background: "#0B2B4E", color: "#fff", border: "none",
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>↓ Export CSV</button>
          </div>

          {/* Summary trial-balance view — each Dr and Cr on its own line */}
          <div style={{ margin: "14px 0 18px", padding: 14, background: "#F7F8FA", borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Summary (all customers combined)</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#667085" }}>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Account</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600, textAlign: "center" }}>Dr/Cr</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600, textAlign: "right" }}>Debit</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600, textAlign: "right" }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {jeSummary.map((r, i) => (
                  <tr key={`${r.account}-${r.side}-${i}`} style={{ borderTop: "1px solid #E4E7EC" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 600, paddingLeft: r.side === "Cr" ? 26 : 10 }}>{r.account}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
                        background: r.side === "Dr" ? "#EFF8FF" : "#F4F3FF",
                        color: r.side === "Dr" ? "#1570EF" : "#7A5AF8",
                      }}>{r.side}</span>
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.side === "Dr" ? cad(r.amount) : ""}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.side === "Cr" ? cad(r.amount) : ""}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid #0B2B4E", fontWeight: 700 }}>
                  <td style={{ padding: "6px 10px" }} colSpan={2}>Total</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{cad(jeTotals.dr)}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{cad(jeTotals.cr)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{
              marginTop: 10, fontSize: 12, fontWeight: 600,
              color: balanced ? "#027A48" : "#B42318",
            }}>
              {balanced ? "✓ Entry balances — debits equal credits" : "✗ Out of balance"}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: "#98A2B3" }}>
              Note: Deferred Revenue appears on two lines — credited when annual contracts are billed, debited as revenue is earned each month.
            </div>
          </div>

          {/* Detailed per-customer entries */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Detail by customer</div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #F0F1F3", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                <tr style={{ textAlign: "left", color: "#667085", borderBottom: "1px solid #E4E7EC" }}>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Entry</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Account</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Dr</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Cr</th>
                </tr>
              </thead>
              <tbody>
                {journalEntries.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#98A2B3" }}>No entries this month — no active contracts.</td></tr>
                )}
                {journalEntries.map((e, ei) => (
                  e.lines.map((l, li) => (
                    <tr key={`${ei}-${li}`} style={{ borderBottom: li === e.lines.length - 1 ? "1px solid #E4E7EC" : "none" }}>
                      <td style={{ padding: "6px 10px", color: li === 0 ? "#1D2939" : "transparent", fontWeight: 600 }}>{e.customer}</td>
                      <td style={{ padding: "6px 10px", color: li === 0 ? "#667085" : "transparent", fontSize: 11.5 }}>{e.type}</td>
                      <td style={{ padding: "6px 10px", paddingLeft: l.cr > 0 ? 24 : 10 }}>{l.account}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.dr > 0 ? cad(l.dr) : ""}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.cr > 0 ? cad(l.cr) : ""}</td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reconciliation: model (should post) vs. accounting software (actually posted) */}
        <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E" }}>Revenue Reconciliation — Model vs. Posted (GL)</div>
              <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 2 }}>Recognized revenue this model expects vs. what was actually posted in the accounting software</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{
                padding: "8px 14px", background: "#fff", color: "#1570EF", border: "1px solid #1570EF",
                borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                ↑ Upload posted CSV
                <input type="file" accept=".csv" onChange={handlePostedUpload} style={{ display: "none" }} />
              </label>
              <button onClick={loadSimulatedPosted} style={{
                padding: "8px 14px", background: "#1570EF", color: "#fff", border: "none",
                borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>Load simulated</button>
              {Object.keys(postedByMonth).length > 0 && (
                <button onClick={clearPosted} style={{
                  padding: "8px 14px", background: "#fff", color: "#667085", border: "1px solid #D0D5DD",
                  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>Clear</button>
              )}
            </div>
          </div>
          {uploadMsg && <div style={{ fontSize: 12, color: "#667085", margin: "8px 0 4px" }}>{uploadMsg}</div>}

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#667085", borderBottom: "1px solid #E4E7EC" }}>
                  <th style={{ padding: "8px 10px", fontWeight: 600 }}>Month</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Recognized (model)</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Posted (GL)</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Variance</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {model.map((row, i) => {
                  const hasPosted = postedByMonth[i] != null;
                  const posted = hasPosted ? postedByMonth[i] : null;
                  const variance = hasPosted ? posted - row.recognized : null;
                  const flagged = hasPosted && Math.abs(variance) >= 0.01;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #F0F1F3", background: flagged ? "#FFFBFA" : "transparent" }}>
                      <td style={{ padding: "7px 10px", fontWeight: 600 }}>{row.month}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{cad(row.recognized)}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: hasPosted ? "#1D2939" : "#D0D5DD" }}>{hasPosted ? cad(posted) : "—"}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: flagged ? 700 : 400, color: !hasPosted ? "#D0D5DD" : flagged ? "#B42318" : "#027A48" }}>
                        {hasPosted ? (variance > 0 ? "+" : "") + cad(variance) : "—"}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        {!hasPosted ? <span style={{ color: "#D0D5DD" }}>—</span> :
                          flagged ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#FEF3F2", color: "#B42318" }}>Investigate</span> :
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#ECFDF3", color: "#027A48" }}>Matched</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {reconTotals.monthsWithData > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid #0B2B4E", fontWeight: 700, background: "#F7F8FA" }}>
                    <td style={{ padding: "9px 10px" }}>Total</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{cad(reconTotals.model)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{cad(reconTotals.posted)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: Math.abs(reconTotals.variance) >= 0.01 ? "#B42318" : "#027A48" }}>
                      {(reconTotals.variance > 0 ? "+" : "") + cad(reconTotals.variance)}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "center" }}>
                      {Math.abs(reconTotals.variance) < 0.01
                        ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#ECFDF3", color: "#027A48" }}>Net nil</span>
                        : <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#FEF3F2", color: "#B42318" }}>{reconTotals.flaggedCount} to fix</span>}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {reconTotals.monthsWithData > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: Math.abs(reconTotals.variance) >= 0.01 ? "#B42318" : "#027A48", fontWeight: 600 }}>
              {Math.abs(reconTotals.variance) < 0.01
                ? `✓ Net variance is nil across ${reconTotals.monthsWithData} month(s) — GL ties to the model.`
                : `Net GL-to-model variance: ${(reconTotals.variance > 0 ? "+" : "") + cad(reconTotals.variance)} across ${reconTotals.flaggedCount} flagged month(s). A net-nil total with flagged months means offsetting errors — still investigate each.`}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: "#98A2B3", lineHeight: 1.6 }}>
            Accepts two CSV formats. <strong>ERP-format export:</strong> columns <em>Posting Period, Account, Debit, Credit</em> — the parser sums net credit (Credit − Debit) to revenue accounts per period, skipping AR and deferred lines. <strong>Simple format:</strong> columns <em>Month, Revenue</em>. Any month where posted revenue differs from the model is flagged <strong>Investigate</strong> — the same variance-resolution task done at month-end close. Try <strong>Load simulated</strong> to see two seeded variances (April and October).
          </div>
        </div>

        {/* Downloads */}
        <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18, marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E" }}>Downloads</div>
          <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 2, marginBottom: 12 }}>Supporting files that back the numbers in this dashboard</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            <a href="metric_calculations.xlsx" download style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
              border: "1px solid #E4E7EC", borderRadius: 8, textDecoration: "none",
              color: "#1D2939", background: "#F7F8FA",
            }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 6, background: "#12805C", color: "#fff",
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>XLSX</span>
              <span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>Metric calculations workbook</span>
                <span style={{ display: "block", fontSize: 11, color: "#98A2B3" }}>Every metric traced by live formula, month by month</span>
              </span>
            </a>
            <a href="sample_erp_revrec_export.csv" download style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
              border: "1px solid #E4E7EC", borderRadius: 8, textDecoration: "none",
              color: "#1D2939", background: "#F7F8FA",
            }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 6, background: "#1570EF", color: "#fff",
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>CSV</span>
              <span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>Sample ERP rev rec export</span>
                <span style={{ display: "block", fontSize: 11, color: "#98A2B3" }}>Upload it to the reconciliation section above to test</span>
              </span>
            </a>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "#98A2B3" }}>
            Downloads work when the dashboard is run or deployed alongside these files (they live in the project's <code>public</code> folder).
          </div>
        </div>

        {/* Contract repository */}
        <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 18, marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2B4E" }}>Contract Repository</div>
          <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 2, marginBottom: 12 }}>Signed subscription agreements (and termination amendments where applicable) backing every contract in this model</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {CONTRACT_FILES.map((f) => (
              <a key={f.id} href={f.file} target="_blank" rel="noreferrer" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                border: "1px solid #E4E7EC", borderRadius: 8, textDecoration: "none",
                color: "#1D2939", background: "#F7F8FA",
              }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 30, height: 30, borderRadius: 6, background: "#0B2B4E", color: "#fff",
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>PDF</span>
                <span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{f.cust}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#98A2B3" }}>{f.id}</span>
                </span>
              </a>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "#98A2B3" }}>
            Links open the signed PDF when the dashboard and the <code>/contracts</code> folder are kept together.
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 16, lineHeight: 1.6 }}>
          <strong>How the accounting works:</strong> Annual contracts are booked in full at contract start, creating a deferred revenue liability that unwinds straight-line over 12 months (ASC 606). Monthly contracts book and recognize together, so they create little deferred balance. Usage-based contracts recognize revenue as consumption occurs and are billed in arrears — there is no deferred revenue; instead an unbilled receivable arises until invoicing. Hybrid contracts combine a fixed platform fee (recognized straight-line) with variable usage. Recognized revenue hits the P&L; the deferred balance sits on the balance sheet until earned. This is the core of SaaS revenue accounting.
        </div>
      </div>
    </div>
  );
}
