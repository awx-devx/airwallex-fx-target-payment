# 06 — UI Kit Spec

The UI kit is **built and reviewed before any page is assembled**. Every component lives in `src/ui/**`, takes props only (no fetching and no global stores), and is rendered in every variant and state on **`/dev/ui-kit`**.

Layers:

1. **Tokens** (`src/ui/tokens`): CSS variables, Tailwind theme, fonts
2. **Primitives** (`src/ui/primitives`): generic controls
3. **Trading** (`src/ui/trading`): finance/terminal-specific atoms and molecules
4. **Chart** (`src/ui/chart`): `FxChart` + overlay primitives
5. **Patterns** (`src/ui/patterns`): composite blocks used directly by pages

Each component ships with: a typed props interface, all variants, a `*.fixtures.ts` file with realistic data (taken from `src/mocks`), and a showcase section on `/dev/ui-kit`.

---

## 1. Tokens showcase

| Section | Shows |
| --- | --- |
| Colours | All surface, text, accent and semantic swatches with the token name + hex + contrast ratio on `--bg-1` |
| Gradients & glows | `--grad-*` shown as unused inventory. `--glow-sm`/`--glow-md` are a 1px orange rule. `--glow-lg` and `--glow-up` are the only blooms (target-hit dialog, locked quote). Pulse toggle. |
| Typography | Every role; number rendering (tabular, pip-emphasis), long/short amounts, 0/2/3-decimal currencies |
| Spacing & radius | Scale visualised |
| Motion | Buttons triggering each duration/ease; tick flash demo; reduced-motion toggle |
| Favourable semantics | Side-by-side: price ↓ renders green, price ↑ renders red; savings sign colours |

---

## 2. Primitives

| Component | Variants | Sizes | States |
| --- | --- | --- | --- |
| `Button` | `primary` (flat `--orange-500`, square, no hover glow), `secondary` (bg-2 + line-2), `ghost`, `outline`, `danger`, `success`, `link` | `xs` `sm` `md` `lg` | default, hover, active, focus (1px orange outline), disabled, loading (spinner), with left/right icon, icon-only, with `Kbd` hint |
| `IconButton` | `ghost`, `secondary`, `primary` | `xs` `sm` `md` | + tooltip, + badge dot |
| `ButtonGroup` / `SegmentedControl` | square, underline | `sm` `md` | selected, disabled item |
| `Input` | text, number, with prefix/suffix (currency code), with left icon | `sm` `md` | focus (1px orange outline), error, disabled, read-only, loading |
| `AmountInput` | currency-aware: masks to Airwallex **payout precision** (KES/SAR 0 dp, [13 §1.1](./13-airwallex-contracts.md#11-currency-precision)), thousand separators, `Max` button | `md` `lg` | invalid, over-balance warning, outside FX limits |
| `RateInput` | price input with pip stepper (±1 pip / ±10 pips), inverted-display toggle | `md` `lg` | above/below entry hint |
| `DateInput` / `DatePicker` | single date; disabled weekends option; disabled non-conversion days with reason tooltip; shows "business days left" | `md` | past date error |
| `Select` / `Combobox` | single, searchable, with flag icons (currency), with description; **async search** (bank lookup) | `sm` `md` | open, empty, loading, truncated ("keep typing to narrow results") |
| `CurrencySelect` | combobox with flag + code + name; groups "Pure conversion" vs "Payout only" ([13 §1.2](./13-airwallex-contracts.md#12-currency-capability)) | `md` | disabled currency with reason tooltip ("Not enabled on this Airwallex account", "Sell only for CN/HK customers") |
| `TransferMethodPicker` | radio cards `LOCAL` / `SWIFT` with flight time ("0–3 business days") and limit from the form schema ([13 §5.3](./13-airwallex-contracts.md#53-method-lead-days-and-limits)) | `md` | selected, over-limit (disabled + reason), single option, no schema data (fallback lead days) |
| `Checkbox`, `Radio`, `Switch` | — | `sm` `md` | checked, indeterminate, disabled |
| `Slider` | single; with tick marks; thumb stays round, focus is a 1px outline | `md` | — (used for buffer bps, validity) |
| `Textarea` | — | — | error, counter |
| `Badge` | `neutral`, `orange`, `up`, `down`, `warn`, `info`, `muted`; `solid`/`soft`/`outline`; square tag, round status dot / pulse dot | `xs` `sm` | — |
| `Chip` | filter chip, removable; square | `sm` | selected (orange 1px rule + wash, no glow) |
| `Kbd` | single, combo (`⌘ K`) | `xs` `sm` | — |
| `Tooltip` | text, rich (title + body). 4px corner, hairline, no drop shadow. | — | delay variants |
| `Popover` | with arrow, without. 4px corner, hairline, no drop shadow. | — | — |
| `DropdownMenu` | items, icons, shortcuts, separators, destructive item, submenu. 4px corner, hairline, no drop shadow. | — | — |
| `Dialog` / `Modal` | `default`, `glow` (target-hit, `--glow-lg`), `danger`. 4px corner, hairline, no drop shadow. | `sm` `md` `lg` | with footer actions, scrolling body |
| `Drawer` / `Sheet` | right, bottom | `md` `lg` | — |
| `Tabs` | underline (terminal bottom panel), square | `sm` `md` | with count badge, disabled |
| `Card` / `Panel` | `flat`, `raised` (no shadow), `glow-border` (flat orange rule), `interactive` | — | hover (surface only), selected (orange rule + wash) |
| `Divider` | horizontal, vertical, with label | — | — |
| `Skeleton` | line, block, circle, chart skeleton | — | shimmer |
| `Spinner` | ring, dots | `xs` `sm` `md` | — |
| `ProgressBar` | linear determinate/indeterminate; segmented (steps) | — | orange / up / warn |
| `Avatar` | image, initials; role ring (approver = orange) | `xs` `sm` | — |
| `Toast` | `info`, `success`, `warning`, `error`, `target-hit` (rich, with action buttons + countdown). 4px corner, hairline, no drop shadow. | — | stacking, auto-dismiss vs sticky |
| `Banner` | inline alert: `info`, `warn`, `error`, `demo-mode` | — | dismissible |
| `EmptyState` | icon + title + body + action | — | — |
| `ScrollArea` | vertical, horizontal | — | — |
| `Table` (base) | dense, zebra off, sticky header, sortable header, row hover, selected row (orange wash + 2px orange inset rule) | — | loading rows, empty |
| `FileDropzone` | idle, drag-over (orange dashed border, no bloom), uploading (per-file progress), error; multi-file | `md` `lg` | — |
| `Stepper` | horizontal steps with square numbered cells | — | current, complete, error |

---

## 3. Trading components

| Component | Purpose | Variants / states |
| --- | --- | --- |
| `PairLabel` | Stacked flags + `EUR/USD` | sizes `sm` `md` `lg`; inverted (`USD/JPY`); with "Payout only" hint |
| `PriceDisplay` | Formatted price with pip emphasis | `inline`, `hero` (44 px + odometer), `axis`; `flash-up`/`flash-down`; `stale` (dimmed + clock icon) |
| `PriceTicker` | Live price + Δ since entry + arrow | favourable/adverse; compact/full; stale; disconnected |
| `DeltaText` | `+0.42%` / `−12 bps` with favourable colouring | `pct`, `bps`, `abs`; neutral when 0 |
| `MoneyDisplay` | Amount + currency with precision | `sm` `md` `lg` `hero`; signed (PnL); masked (••••) |
| `SavingsCell` (PnL) | Savings in H + % | positive / negative / zero; tween on change |
| `DistanceToTarget` | Bar + label showing how far the price is from the target | far (>1%), near (<0.25%, warn), at/through target (flat orange fill), inverted |
| `CountdownChip` | Time left | `quote` (mm:ss), `deadline` (d h), `autosettle`; normal / < 5 min warn / < 60 s urgent pulse / expired |
| `DeadlineMeter` | Horizontal timeline: armed → now → execute-by → due | normal, final day, overdue, with skipped non-conversion day ("Skipped Dec 25: Christmas Day"); compact (list) / full (ticket) |
| `StateBadge` | Bill state badge (see [03 §1](./03-domain-model.md#state-reference)) | every `BillState`, with pulse for `WATCHING`/`TARGET_HIT`/`DEADLINE_WINDOW` |
| `TransferStatusPill` | Airwallex status with step dots `Scheduled → Processing → Sent → Paid` | every `TransferStatus` ([13 §4.3](./13-airwallex-contracts.md#43-status-maps)) incl. `OVERDUE`, `FAILED` with category, "Failed after paid" (late failure), "Awaiting Airwallex approval" (`IN_APPROVAL` family) |
| `ConnectionIndicator` | Feed health dot | live (green pulse), delayed (warn), offline (down), simulated (orange "SIM") |
| `EnvBadge` | `SANDBOX` / `PRODUCTION` / `DEMO · SIMULATED MARKET` | — |
| `BalancePill` | Wallet balance (`available`) for a currency; tooltip with pending / reserved / total | normal, low (warn), insufficient for selected bill (down) |
| `Sparkline` | Tiny line with the target line + last dot | favourable/adverse; with target hit dot; loading |
| `StrategySummary` | "Target 1.07500 · Max cost 268,750 USD · Buffer 0 bps" | rate mode / max-cost mode / not set |
| `QuoteCard` | Locked quote: price, sell/buy amounts, fees, validity countdown, "Settles {date}", spread vs mid (bps), Airwallex quote ID ([13 §3.2](./13-airwallex-contracts.md#32-quote--quotes--quotesummary--quotecard--approvalcard)) | `target` (green glow), `deadline` (amber), `expired` (muted + "re-quote"), `near-miss` info |
| `CostBreakdown` | Bill amount × price, fee (paid by), SWIFT-charges note, total you pay, "vendor receives", vs entry, vs target ([13 §4.2](./13-airwallex-contracts.md#42-response--executions--executionsummary--transfertracker)) | estimated, **tentative** (transfer created, not yet `SCHEDULED`), locked; fee-unknown note; vendor receives less than invoice (warn) |
| `ActivityItem` | One `bill_event` row (icon, text, ts, actor) | one variant per event type |
| `KeyValueList` | Dense label/value rows | — |
| `ExtractionField` | Extracted field with confidence dot + edit | high / medium / low confidence; edited; missing |
| `BeneficiaryCard` | Vendor bank display (masked), bank name, methods, verification badge | every `AccountVerification` result ([13 §5.4](./13-airwallex-contracts.md#54-bank-search-validate-verify)): name matches, partial match / incorrect type (confirm checkbox), not matched (danger), account invalid (blocks arming), not verified; missing fields; error |
| `ShortcutHint` | Floating hint for keyboard shortcuts | — |

---

## 4. Chart (`src/ui/chart`)

### `FxChart` props

```ts
interface FxChartProps {
  pair: { base: string; quote: string };
  inverted?: boolean;
  series: ChartSeriesPoint[];            // live/own ticks
  reference?: ChartSeriesPoint[];        // third-party history
  overlays: ChartOverlays;               // entry, target, quote band, deadline, due, now, markers
  strategyMode?: 'TARGET_RATE' | 'MAX_COST';
  range: '1H' | '1D' | '1W' | '1M' | 'ALL' | 'TO_DUE';
  type?: 'area' | 'line' | 'candles';
  height?: number | 'fill';
  state?: 'ready' | 'loading' | 'empty' | 'stale' | 'error';
  interactive?: boolean;                 // drag target line
  onTargetDrag?: (price: string) => void;
  onRangeChange?: (r: FxChartProps['range']) => void;
}
```

### Overlay primitives (each also shown standalone in the kit)

| Primitive | Showcase variants |
| --- | --- |
| `EntryLine` | with/without label; inverted pair |
| `TargetLine` | idle, hovered, **dragging** (value bubble follows the cursor, cost preview), just-hit pulse, max-cost label |
| `TargetZone` | on/off; inverted (zone flips to above) |
| `QuoteBand` | target quote (green), deadline quote (amber), expiring (< 60 s pulse), expired (muted) |
| `DeadlineLine` | normal, today (glow-warn), passed |
| `DueDateLine` | normal, today |
| `NowLine` | — |
| `EventMarkers` | every marker kind (incl. `SIM_START`/`SIM_END` "SIM" flags); clustering when overlapping |
| `SimulatedSegment` | series segment inside `simulatedRanges` drawn dashed in `--orange-300` at reduced opacity, with a faint hatched background; open-ended (running) and closed |
| `CrosshairTooltip` | price, Δ entry, Δ target, cost at price, time |
| `RangeSwitcher` | segmented control above the chart |
| `ChartHeader` | pair label, hero price, Δ, connection indicator, range switcher, chart-type toggle |

### Chart scenarios on the kit page (fixtures)

1. **Watching, far from target**: price hovering above the target, deadline 12 days out
2. **Approaching target**: distance < 0.25%, near-miss marker
3. **Target hit**: price through the target, quote band active with a countdown
4. **Rejected & re-armed**: rejected marker, price bounced, still watching
5. **Final day**: now line on the deadline line, amber quote band, autosettle countdown
6. **Auto-settled**: ⚡ marker, executed
7. **Paid**: executed ✓ marker, lines frozen, post-execution series dimmed
8. **Max-cost mode**: target label shows cost
9. **Inverted pair** (USD/JPY display for a JPY bill)
10. **No reference history** (exotic pair, only own ticks)
11. **Loading / empty / stale / error**
12. **Live simulation**: attached to the in-browser simulated market (from `src/mocks/market`) and ticking every 500 ms; exposes buttons to "nudge down 20 pips" and "jump to deadline day"
13. **Simulate run**: a Simulate button on the scenario replays the full [08 §1.1](./08-demo-plan.md#11-simulate-button) timeline in the browser: the simulated segment eases into the target zone, then target-hit pulse, auto-approved marker, executed marker

---

## 5. Patterns (composites)

| Pattern | Contents | Variants / states |
| --- | --- | --- |
| `TopBar` | Logo/wordmark, `EnvBadge`, `BalancePill`s (H + top 3), `ConnectionIndicator`, notifications bell (count), role switcher (Preparer/Approver), clock (shows warp speed in demo) | normal, demo mode, offline |
| `BillListItem` (market row) | `PairLabel`, vendor, amount, `Sparkline`, `PriceTicker` mini, `DistanceToTarget` mini, `CountdownChip` (deadline), `StateBadge` | every state; selected (orange wash + 2px inset rule); hover; compact vs comfortable |
| `BillList` (left rail) | Search, filter chips (All / Watching / Needs approval / Final day / Paid), group-by-pair toggle, sort (deadline, distance, amount), list of `BillListItem`, "Upload bills" CTA | empty, loading, many (virtualised) |
| `PairGroupHeader` | When grouped: pair, total exposure in F and H, count | — |
| `BillTicket` (right rail) | Tabbed: **Strategy** (mode toggle rate/max cost, `RateInput`/`AmountInput`, equivalents, advanced: buffer, confirm ticks, validity, cutoff), **Details** (bill fields, documents, beneficiary), **Activity** | per bill state: READY (arm form), WATCHING (edit + pause/pay now), TARGET_HIT (shows `ApprovalCard` inline), DEADLINE_WINDOW, IN_FLIGHT (transfer tracker), PAID (receipt), FAILED (error + fix) |
| `ArmConfirm` | Summary + **standing instruction consent** checkbox ("If not approved by 14:00 on Oct 14, pay at market") | valid, missing consent, target already met |
| `ApprovalCard` | `QuoteCard` + `CostBreakdown` + savings vs entry + balance check + Approve (primary, `A`) / Hold for better (`H`) / Cancel bill | target-hit, deadline, expired, insufficient balance, approving (loading), approved, as preparer (read-only "waiting for approver"), **simulated trigger** (shows "Triggered at … (simulated) · Airwallex quote … (actual)"), **auto-approved (simulation)** |
| `ApprovalModal` | `ApprovalCard` in a `glow` dialog, opened from a toast or a notification | — |
| `TransferTracker` | `TransferStatusPill` + timeline + Airwallex IDs (short ref first; transfer and quote UUIDs) + amounts + funding sub-row (shown when not `FUNDED`) + dispatch date | each status; tentative vs confirmed amounts; failed per `FailureCategory` with next step ([13 §4.5](./13-airwallex-contracts.md#45-failure-categories)); late failure after paid; demo "advance status" button slot |
| `PositionsPanel` (bottom) | Tabs: **Positions** (active bills table), **Approvals** (pending), **Executed**, **Activity** (global feed) | each tab: loading, empty, populated |
| `PositionsTable` | Columns: Pair, Vendor, Amount, Entry, Mark, Target, Distance, Savings, Est. cost, Execute by, State, Actions | sortable; row selected; row flashing on tick; row actions menu |
| `UploadModal` | `FileDropzone` multi-file → per-file extraction progress → "Review n bills"; demo-only "Add sample invoices" (1–5 generated files, [11 §7](./11-test-data-and-seeding.md#7-interfaces)). The extracting state shows a `ThinkingOrb` (`thinking-orbs`) per file, `state` following the stage (`working` → `searching` → `solving`), paused under reduced motion ([07 §2](./07-pages-spec.md#2-upload--review-flow-upload-also-a-modal-over-the-terminal)) | idle, dragging, uploading, extracting (each orb state), partial failure, generating samples |
| `ExtractionReview` | Split view: document preview (PDF/image) on the left, `ExtractionField` form on the right, bill n of m stepper, transfer reason `Select` + payment reference, beneficiary resolution (match existing, or `SchemaForm`), "Save as draft" / "Continue to strategy" | high confidence, low-confidence fields highlighted, missing bank details, duplicate invoice warning, Airwallex `FieldError`s inline (from validate-at-arm) |
| `SchemaForm` | Renders a `BeneficiaryFormSchema` ([13 §5.2](./13-airwallex-contracts.md#52-dynamic-form--beneficiaryformschema--schemaform)): `INPUT`/`SELECT`/`DYNAMIC_SELECT`/`RADIO`/`TRANSFER_METHOD` fields, required markers, help tips, regex validation, `refresh` refetch, bank search; maps `FieldError.path` onto fields | fixtures EUR/IBAN (DE), GBP/sort code, INR/IFSC, USD/ACH; loading schema; refetching after a `refresh` field; field errors; submit → validate → verify |
| `StrategyWizardStep` | Target setup with a mini `FxChart` (draggable target) + equivalents | rate mode, max-cost mode |
| `NotificationCenter` | Popover list of notifications, grouped by bill | unread, read, action-required |
| `CommandPalette` | `⌘K`: jump to bill, upload, approve pending, toggle demo panel | — |
| `ShortcutsSheet` | `?` overlay listing shortcuts | — |
| `DemoControlBar` | (demo only) floating bar: market speed, time warp, nudge price, jump to deadline, advance transfer, **Simulate selected bill** | collapsed / expanded |
| `SimulateButton` | (demo only) ticket action on `WATCHING` bills: "Simulate target hit" with a small popover for duration (5–60 s). While running it becomes `SimProgress`: phase stepper (Ramping → Target hit → Auto-approved → Executing → Settling → Paid), ETA, and Stop | idle, running per phase, done, aborted, failed (error from the pipeline) |
| `SettingsForm` | Home currency, lead days, validities, deadline window and cutoff (account time zone shown) | — |

---

## 6. UI kit review page

**Route:** `src/app/dev/ui-kit/page.tsx`. It is only available when `DEMO_MODE=true` or `NODE_ENV=development`.

**Layout**
- Left: a sticky nav tree of sections (Tokens / Primitives / Trading / Chart / Patterns) with search. The nav edge is a 1px `--line-1` rule.
- Main: the stage is the scroll pane (no outer padding, no panel shadow). One **Showcase** block per component, bands separated by a shared `border-b`:
  - Title, import path, short description
  - A **variant matrix** (grid of variants × sizes × states), rendered from fixtures
  - A **playground**: a prop knob panel (select/boolean/text knobs generated from a small per-component `knobs` config)
  - A "Copy usage" snippet
- Global toolbar: density toggle (compact/comfortable), reduced-motion toggle, "freeze time" toggle (stops ticking for screenshots), background toggle (`bg-0`/`bg-1`), **simulated market speed** (for live components), and a width presets switch (1280/1440/1920).

**Implementation**
- Each component folder exports `showcase.tsx` with `export const showcase: Showcase = { title, sections: [...] }`. The page auto-discovers these through an index file. There is no Storybook dependency. If the team prefers Storybook later, the same `showcase` configs can generate stories.
- Deep links: `/dev/ui-kit#trading/countdown-chip`.
- Snapshot testing: Playwright visits every section anchor with "freeze time" on and takes screenshots. These become the visual regression baseline once the kit is signed off.

**Review gate (U5 exit criteria)**
- [ ] Every component in §2–§5 is present with the listed variants/states
- [ ] Favourable-direction story passes review
- [ ] Chart scenarios 1–13 render correctly at 1280/1440/1920
- [ ] Keyboard focus visible everywhere; dialogs trap focus
- [ ] Reduced-motion mode verified
- [ ] Glow usage review: glow only on the chart target line, a locked target quote (`--glow-up`), and the target-hit approval dialog (`--glow-lg`)
- [ ] Sign-off recorded in [09](./09-decisions-and-open-questions.md) (date + reviewers)
