# 00 — Product Brief

## One-liner

A trading-terminal-style treasury tool that turns every foreign-currency bill into a **conditional FX order with a guaranteed expiry**: pay when the rate hits your target, or pay at market on the final safe day — never late.

## Problem

Finance teams paying foreign-currency invoices face a daily choice: convert now, or wait for a better rate. In practice they either:

- convert immediately on receipt (leaving savings on the table), or
- watch rates manually and risk forgetting until the due date (paying a bad rate, or paying late).

There is no simple "limit order with a deadline" for payables.

## Users

One person. They upload the bill, review the extracted fields, set the target, and submit. That submit authorizes the payment. The system then watches the rate and pays.

## Core flow

```mermaid
flowchart TD
  U[Upload one or more bills] --> X[Extract fields<br/>vendor, amount, currency, due date, bank details]
  X --> R[Review and confirm]
  R --> S[Set strategy<br/>target rate OR max cost]
  S --> A[Submit: capture entry rate<br/>+ standing instruction consent]
  A --> W{Watching}
  W -- rate at or under target --> P[Lock quote and pay]
  W -- quote worse than target --> W
  W -- user pauses --> PAUSED[Paused]
  PAUSED -- resume --> W
  W -- deadline cutoff, target never hit --> P
  PAUSED -- cutoff still pays --> P
  P --> T[Track transfer<br/>SCHEDULED → PROCESSING → SENT → PAID]
```

## The perps-terminal metaphor

We use the metaphor deliberately, because it gives users a fast and familiar way to understand their FX exposure.

| Perps concept | FX Target Payment equivalent |
| --- | --- |
| Market (e.g. `ETH-PERP`) | Currency pair, `F/H` (e.g. `EUR/USD`) |
| Position | A bill (one bill = one position; many bills may share a market) |
| Position size | Bill amount in F |
| Entry price | Entry rate (indicative all-in rate when armed) |
| Limit order / take-profit line | Target rate line |
| Liquidation / expiry line | Execution deadline (vertical), due date (vertical) |
| Unrealized PnL | Savings vs entry, in H |
| Mark price | Current indicative rate |
| Order ticket panel | Bill ticket: strategy, amounts, deadline |
| Positions / orders / history tabs | Active bills / executed / activity log |
| Market switcher + watchlist | Bill list with sparklines, grouped by pair |
| Fill | Conversion booked + transfer created |

Unlike a real perp, there is **no leverage and no liquidation risk**. The "expiry" is a guarantee that the bill gets paid, not a loss event.

## Key product rules

1. **The deadline is sacred.** Every armed bill *will* be paid by its execution deadline, no matter what the rate does.
2. **Submit authorizes the payment.** The standing instruction captured at submit covers both paths: pay when the rate is at or under the target, and pay at market at the execution-deadline cutoff if the target is never hit.
3. **Payment uses a locked quote.** The worker locks a quote and pays in the same job. If that quote is worse than the target, the bill stays watching.
4. **Everything is explainable.** Every state change is written to an activity log that is shown in the UI.

## Scope for the demo (in)

- Multi-bill upload (PDF/image), field extraction with a human review step
- Per-bill chart with entry, target, deadline and due-date lines; live ticking
- Target by **rate** or by **max cost**, both displaying the equivalent of the other
- Rate monitoring, target detection, quote locking, in-app alerts (toasts + notification centre; no email/Slack in the demo)
- Automatic payment when the target is hit, and at the execution-deadline cutoff if it is not
- Airwallex sandbox execution: quote → transfer (with conversion) → status tracking via webhooks
- **Demo mode**: market simulator and time controls so the full lifecycle can be shown in minutes

## Non-goals (demo)

- Multi-tenant org management, SSO, fine-grained RBAC
- Accounting / ERP sync (Airwallex Spend Bills sync is a stretch goal, see B-track)
- FX forwards / hedging products beyond a spot conversion paired with a transfer
- Payout-rail holiday calendars (the deadline math skips weekends and Airwallex's FX non-conversion days, but not local clearing holidays; lead days absorb them)
- A dedicated mobile design (the desktop terminal is the target; smaller widths reflow the same layout into drawers, [07 §1](./07-pages-spec.md#responsive-behaviour))

## Success criteria for the demo

- A viewer understands the whole concept within 30 seconds of seeing the terminal.
- Full lifecycle for three bills shown live in under 5 minutes: one hits its target and pays, one stays watching (pause or edit the target), and one pays at the deadline.
- Real Airwallex sandbox transfer IDs are visible, and statuses update through webhooks.
