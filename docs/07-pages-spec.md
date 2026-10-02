# 07 — Pages Spec

Pages are assembled in `src/features/**` from UI-kit components only. Data comes from hooks (`useBills`, `useBill`, `useChart`, `useStream`, `useApprovals`, `useBalances`) that are backed by a **`DataSource`**: `mock` (fixtures + in-browser simulated market) during U6, and `api` (REST + SSE) after integration. Switch with `NEXT_PUBLIC_DATA_SOURCE=mock|api`.

---

## 1. Terminal (`/` and `/bills/:id`)

The main screen, modelled on a perps trading terminal.

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ TopBar: [mark] · USD 1,240,000 · EUR 80,000 · ● Live · 🔔3 · Approver ▾                    │
├──────────────┬──────────────────────────────────────────────────────────┬─────────────────┤
│ BillList     │ ChartHeader: 🇪🇺🇺🇸 EUR/USD  1.08412 ▼0.21%  ● Live  1H 1D 1W 1M TO_DUE │ BillTicket      │
│ [search]     │──────────────────────────────────────────────────────────│ [Strategy|Det.| │
│ All·Watch·   │                                                          │  Activity]      │
│ Approve·Final│        FxChart                                           │                 │
│              │        ── ENTRY 1.08412 ───────────────────────  │  │    │ Mode: ◉Rate ○Max│
│ ▸ EUR/USD    │        - - TARGET 1.07500 (glow) - - - - - - -  │  │    │ Target 1.07500  │
│   Acme GmbH  │        ░░░░░░ favourable zone ░░░░░░░░░░░░░░░░  │  │    │ ≙ 268,750 USD   │
│   250k  ~~~  │                                         EXEC BY │ DUE│    │ Savings +2,280  │
│   Δ0.84% 12d │                                                          │ DeadlineMeter   │
│ ▸ GBP/USD    │                                                          │ [Pause] [Pay now]│
│ ▸ INR/USD    │──────────────────────────────────────────────────────────│                 │
│   …          │ PositionsPanel: Positions | Approvals(1) | Executed | Activity             │
│ [+ Upload]   │ Pair  Vendor  Amount  Entry  Mark  Target  Savings  Exec by  State        │
└──────────────┴──────────────────────────────────────────────────────────┴─────────────────┘
```

The sheet sits on `--bg-0` with the grain aurora from [05 §2](./05-design-system.md#grain-aurora) along the bottom edge, behind the panels. It pauses under reduced motion. The diagram's ticket column is a right drawer, not a docked rail, at every width. The sheet is at most 1600px wide. From `md` up a gutter shows the ground on either side, and a hairline on each edge runs from the top bar through the body. The top bar rule continues across the full viewport. Below `md` the sheet is flush. The grain is not inset. The bill list has no background fill.

### Behaviour

- **Selection:** clicking a bill in the list or a table row selects it. The URL updates to `/bills/:id` (shallow) and the chart and ticket switch instantly. The chart header adds the vendor and amount in `--fg-3` beside the market. The previous chart instance is kept warm for fast back-and-forth, like switching markets.
- **Row menu:** every table row has a three-dot menu, held on the left when the table scrolls sideways. The cell stays transparent, and the other columns clip at its edge. The first item is **Open ticket**, which selects the bill and opens the ticket drawer. Further items come from `allowedActions`, in sentence case (Arm, Pay now, Pause). Cancel is last and uses `--down`. Review, Edit, Edit strategy, and Resolve beneficiary (except on a failed bill, which re-arms) also open the ticket.
- **Grouping:** "Group by pair" in the list shows `PairGroupHeader` with the total exposure. Bills in the same pair share the reference series but keep **their own** entry and target lines and their own deadline.
- **Live updates:** SSE `tick` updates the list sparkline, the table row (flash), the chart and the ticket. `bill.updated` re-renders the state badges. `approval.requested` raises a **target-hit toast** with Approve/Review actions, and adds a badge to the Approvals tab.
- **Bottom tabs partition the list.** Every bill is on exactly one of Positions (still working, including drafts), Approvals (`TARGET_HIT` and `DEADLINE_WINDOW`), or Executed (`IN_FLIGHT`, `PAID`, `FAILED`, `CANCELLED`). Activity is the selected bill's events, not another slice of the book. From `lg` up the panel is a fixed `18rem` and the active tab scrolls inside it, so switching tabs does not resize the chart. Below `lg` the panel sizes to its content and the column scrolls.
- **Chart interactions:** in `WATCHING`/`READY`, the user can drag the target line to edit the target. A cost preview bubble follows the cursor, and releasing it opens a confirm popover. The range defaults to `TO_DUE` (from arming until the due date + padding).
- **Ticket by state:**

| State | Ticket shows | Primary action |
| --- | --- | --- |
| `DRAFT` | "Needs review" + fields summary | Review bill |
| `READY` | Strategy form + `ArmConfirm` | **Arm** (`Enter`) |
| `WATCHING` / `PAUSED` | Strategy (editable), savings, distance, `DeadlineMeter` | Pause/Resume, Pay now (demo, `WATCHING` only: **Simulate target hit**, see [08 §1.1](./08-demo-plan.md#11-simulate-button)) |
| `TARGET_HIT` | Inline `ApprovalCard` (target) with quote countdown | **Approve** (`A`), Hold (`H`) |
| `DEADLINE_WINDOW` | Inline `ApprovalCard` (deadline) + auto-settle countdown | **Approve** |
| `AUTO_SETTLING` / `APPROVED` / `EXECUTING` | Progress + quote used | — |
| `IN_FLIGHT` | `TransferTracker` | (demo: Advance status) |
| `PAID` | Receipt: rate, cost, savings vs entry, vs target, transfer IDs | Download receipt (stretch) |
| `FAILED` | Error + reason + fix path | Edit & re-arm |

### Responsive behaviour

Desktop is the design target (the pitch runs at 1440+), but every page must stay usable down to a phone width. The rule is reflow, not a second design: the same components move into drawers.

| Width | Terminal |
| --- | --- |
| ≥ 1440 px (`2xl`) | Bill list and centre (chart + bottom panel). The ticket is a right drawer, opened from **Open ticket** on a row or the Ticket button in the top bar |
| 1280–1439 px (`xl`) | Same. The ticket stays a drawer |
| 1024–1279 px (`lg`) | The bill list collapses too: a **menu button** in the top bar opens it as a left drawer. The centre fills the width |
| < 1024 px | As above, and the chart stacks above the bottom panel instead of beside it. The top bar keeps the logomark, the menu button, the ticket button and the notification bell. Below `xl`, balances, the role switch, and the connection label leave the bar and sit at the top of the bill list — the rail while it is open, otherwise the menu drawer |

Other pages follow the same split: the upload review's document preview stacks above the fields below `lg`, and settings uses a single column. Dialogs that are wider than the viewport shrink to full width. Touch targets stay at least 32 px, which the comfortable density already gives.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `J` / `K` | Next / previous bill |
| `/` | Focus bill search |
| `⌘K` | Command palette |
| `U` | Upload bills |
| `A` | Approve active approval (approver role) |
| `H` | Hold for better (reject + keep watching) |
| `P` | Pause / resume |
| `T` | Focus target input |
| `1`–`5` | Chart range |
| `G` | Toggle group by pair |
| `?` | Shortcuts sheet |
| `` ` `` | Toggle demo control bar (demo mode) |

---

## 2. Upload & review flow (`/upload`, also a modal over the terminal)

1. **Drop** (`UploadModal`): multi-file PDF/PNG/JPG (≤ 20 MB each). Each file gets a row with upload → extraction progress. Files process in parallel (max 4). The user can close the modal; progress continues and a toast appears on completion.
   - While a file's extraction `status` is `RUNNING`, the row shows a [`ThinkingOrb`](https://libraries.dev/orbs) (`thinking-orbs`, D-21) instead of the generic spinner, since a model is reading the document. The orb's `state` follows the stage the server reports: `working` while queued, `searching` while the deterministic readers run, `solving` while Claude (or the escalation model) reads the document, and it is removed the moment the status becomes `DONE` or `FAILED`. Size 20 inline in the file row, size 64 on the extraction screen itself. `dark`, `speed` 1. Under reduced motion the orb is `paused` and the row falls back to the status text.
2. **Review** (`ExtractionReview`), one bill at a time with a stepper (1 of n):
   - Left: document preview with extracted-field highlights (bounding boxes if the extractor returns them).
   - Right: fields for vendor, invoice #, currency, amount, issue date, due date, payment reference (defaults to the invoice #), transfer reason (Airwallex `reason` enum, default "Bill payment"), and bank details. Low-confidence fields are outlined in `--warn`.
   - Beneficiary: "Match existing" (by name/IBAN) or "Create in Airwallex" (`SchemaForm` driven by the Airwallex form schema, with bank search). On save: validate → create → verify account where supported. The result is a `BeneficiaryCard` with the verification badge. A partial or no name match needs an explicit confirmation; "Account doesn't exist" blocks the bill ([13 §5](./13-airwallex-contracts.md#5-beneficiaries)).
   - Warnings: duplicate invoice #, due date in the past, currency not payable or not enabled on the account, amount outside FX limits ($1–$5M) or the method's limit, IDR/VND quota.
   - Actions: **Save draft** · **Continue to strategy**.
3. **Strategy** (`StrategyWizardStep`): a mini chart with the live price. Choose target rate or max cost (quick presets: −0.5%, −1%, −2% from current), review the execution deadline (method via `TransferMethodPicker` with flight time; lead days default from it; skipped non-conversion days shown), and accept the standing instruction. **Arm** runs a `transfers/validate` dry run first; any Airwallex field errors send the user back to the matching review field.
4. After the last bill, return to the terminal with the first newly armed bill selected, and show a confetti-less "3 bills armed" toast.

## 3. Approval (deep link `/approvals/:id`)

Opens the terminal with the bill selected and `ApprovalModal` in front. This is what notifications and toasts link to. If the approval has expired or been resolved, show the resolved state with a "View bill" action.

## 4. Settings (`/settings`)

`SettingsForm`: home currency (read-only in the demo), default lead days per method, quote validities, deadline window open time and auto-settle cutoff (with the account time zone displayed), trigger confirmation ticks and buffer. Times across the app are shown in the viewer's local time zone, with the account zone (`America/Los_Angeles`) in a tooltip.

## 5. Demo control room (`/dev/market`, demo only)

A full-page version of `DemoControlBar` (see [08](./08-demo-plan.md)): per-pair price controls, volatility, drift, time warp, scenario launcher, transfer simulation buttons, and the event log.

## 6. States & edge cases (all pages)

| Case | Treatment |
| --- | --- |
| No bills | Terminal shows `EmptyState` with "Upload your first bills" + a sample-data button (demo) |
| Feed stale > 2 intervals | `ConnectionIndicator` turns warn; price dims; chart shows the `stale` state; triggers are suspended (server-side) |
| SSE disconnected | Banner "Reconnecting…"; falls back to polling every 10 s |
| Insufficient balance | `BalancePill` turns red for H; the approval card disables Approve and offers "Top up (sandbox)" in demo |
| Preparer role | Approve buttons are replaced with "Waiting for approver" + a nudge action |
| Multiple approvals pending | Approvals tab sorted by soonest expiry; toasts stack (max 3) |
| Quote expires while the modal is open | Modal switches to the expired state; target flow shows "Back to watching", deadline flow auto re-quotes |
| Transfer fails after `PAID` (late failure) | Bill moves to `FAILED`; toast + ticket shows "Returned after paid · {category}" with the next step |
| Airwallex config problem (`AIRWALLEX_CONFIG`: missing scope, approval workflow on, quotes not enabled) | Persistent error `Banner` in the terminal naming the problem; arming and execution are blocked until fixed |
