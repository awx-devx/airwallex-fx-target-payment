# U — UI Track

**Goal:** a complete, reviewed UI kit first, then the terminal and flows assembled on mock data, then wired to the real backend.

**References:** [05 Design system](../05-design-system.md) · [06 UI kit spec](../06-ui-kit-spec.md) · [07 Pages spec](../07-pages-spec.md) · [03 Contracts](../03-domain-model.md#5-contracts-shared-febe) · [13 Airwallex → Contracts & UI](../13-airwallex-contracts.md) (every Airwallex enum, status, fee, error and schema field the UI renders)

**Rules for the whole track**
- `src/ui/**` is **props-only**: no fetching, no stores, and no imports from `server/` or `features/`.
- Every component ships with its `showcase.tsx` on `/dev/ui-kit` **in the same PR**.
- Money and rates are handled as decimal strings; format them through `src/ui/format/*` (never `Number()` for display math).
- Direction colours always go through `favorable()`.

Estimates are for one engineer.

---

## C0 — Contracts & mocks (shared with B) · ~1 day

Owned jointly. It blocks U2 onwards, so do it first.

| ID | Task | Done when |
| --- | --- | --- |
| C0.1 | `src/contracts/*`: zod schemas + types for `BillSummary`, `ApprovalSummary`, `ChartSeriesPoint`, `ChartOverlays`, SSE event union, REST request/response bodies and `permissions.ts` (`allowedActions(bill, role)`, [03 §5](../03-domain-model.md#5-contracts-shared-febe)). Plus the Airwallex-derived types in [13 §8](../13-airwallex-contracts.md#8-contract-additions-srccontracts): `airwallex.ts` enums (verbatim values), `QuoteSummary`, `ExecutionSummary`, `BalanceSummary`, `BeneficiarySummary` + `AccountVerification`, `BeneficiaryFormSchema`, `FieldError`, `ApiError` | Types compile; `pnpm test contracts` validates the fixtures and covers `allowedActions` for every state × role |
| C0.1b | `src/contracts/airwallex-errors.ts`: `fieldErrorMessage(code, params)` for codes `001`–`102` ([13 §2.2](../13-airwallex-contracts.md#22-field-validation-codes-001102--form-copy)), and `failureCategory()` ([13 §4.5](../13-airwallex-contracts.md#45-failure-categories)) | Unit tests per code group; unknown codes fall back to the Airwallex message |
| C0.2 | `src/contracts/currencies.ts`: currency list with `payoutPrecision` (Airwallex Payouts table: **KES/SAR 0 dp**) and `isoPrecision`, plus FX capability flags `buy`/`sell`/`pureConversion`/`convertAndPayout` with conditional notes (IDR, MYR, AED), per [13 §1.1–1.2](../13-airwallex-contracts.md#11-currency-precision) | Used by the formatters, `AmountInput` and `CurrencySelect` |
| C0.3 | `src/mocks/fixtures/*`: 8–10 bills covering **every `BillState`**, approvals (target, deadline, expired), and events. Airwallex-shaped fixtures: executions in **every `TransferStatus`** (incl. `IN_APPROVAL`, late failure after `PAID`, `FAILED`→auto-`CANCELLED`), every `FundingStatus`, one failure per `FailureCategory`, tentative vs confirmed amounts, every `AccountVerification` result, and 4 form schemas (EUR/IBAN DE, GBP/sort code, INR/IFSC, USD/ACH) with `FieldError` sets. Replace them with recorded sandbox responses after B2.1 | The fixture set is referenced by the kit scenarios |
| C0.6 | `src/mocks/generators/*` ([11 §8](../11-test-data-and-seeding.md#8-code-layout)): seeded PRNG, corridors, vendors, bank details (with checksums), invoices, profiles. Pure and browser-safe, so the mock `DataSource` can build `mixed`/`stress` sets from a seed | Same seed → identical snapshot; totals exact at currency precision |
| C0.4 | `src/mocks/market/*`: seeded GBM simulator with `nudge`/`rampTo`/`spike`, and a browser-side warp clock | Deterministic under a seed; used by the kit's live scenarios |
| C0.5 | `DataSource` interface + `mock` implementation (in-memory store driven by fixtures + simulator, with emitted events matching the SSE contract) | Hooks can be written against it in U6 |

---

## U0 — App scaffold · ~0.5 day

| ID | Task | Done when |
| --- | --- | --- |
| U0.1 | Next.js (App Router, TS strict), pnpm, ESLint + Prettier, path aliases (`@/ui`, `@/contracts`, …) | `pnpm dev` runs |
| U0.2 | Tailwind v4 + `tokens.css` wiring, fonts (Inter, JetBrains Mono / Geist Mono) via `next/font`, and the `motion` dependency (Motion, [05 §6](../05-design-system.md#6-motion)) | Tokens visible in devtools |
| U0.3 | `/dev/ui-kit` shell: nav tree, section registry, global toolbar (density, reduced motion, freeze time, bg, width presets) | Empty sections render |
| U0.4 | ESLint boundary rule (`no-restricted-imports`) that enforces the `src/ui` isolation | Lint fails on a violation |
| U0.5 | Playwright set up with a `ui-kit` screenshot spec (runs per anchor) | `pnpm test:visual` runs |

## U1 — Tokens & theme · ~1 day

| ID | Task |
| --- | --- |
| U1.1 | Colour, surface, text, semantic tokens ([05 §2](../05-design-system.md#2-colour-tokens)) |
| U1.2 | Glow/elevation tokens + `glow-pulse` keyframes + reduced-motion overrides |
| U1.3 | Typography roles + number utilities (`.num`, pip emphasis) |
| U1.4 | Spacing, radius, density (compact/comfortable via a `data-density` attribute) |
| U1.5 | Motion tokens + `MotionConfig` (reduced motion from `prefers-reduced-motion` and the kit toggle) + `useTickFlash`, `useTween` hooks built on Motion (UI-only) |
| U1.6 | Formatters: `formatPrice(pair, value, {inverted})`, `formatMoney(ccy, value, {signed})`, `formatDelta`, `formatCountdown`, `favorable(delta)` + unit tests |
| U1.7 | Tokens showcase sections ([06 §1](../06-ui-kit-spec.md#1-tokens-showcase)) incl. the **favourable semantics** story |

**Exit:** the tokens page is reviewed; contrast ratios are listed; formatters have 100% unit coverage.

## U2 — Primitives · ~3 days

All components in [06 §2](../06-ui-kit-spec.md#2-primitives), on Radix where applicable.

| ID | Group |
| --- | --- |
| U2.1 | Button, IconButton, ButtonGroup/SegmentedControl, Kbd |
| U2.2 | Input, AmountInput, RateInput, Textarea, Checkbox/Radio/Switch, Slider |
| U2.3 | Select/Combobox (incl. async search with a "keep typing" truncated state), CurrencySelect (capability groups, account-disabled state), DateInput/DatePicker, TransferMethodPicker (flight time + limits, [13 §5.3](../13-airwallex-contracts.md#53-method-lead-days-and-limits)) |
| U2.4 | Badge, Chip, Avatar, Spinner, Skeleton, ProgressBar, Divider |
| U2.5 | Tooltip, Popover, DropdownMenu, Dialog (default/glow/danger), Drawer — all enter/exit through Motion `AnimatePresence` ([05 §6](../05-design-system.md#6-motion)) |
| U2.6 | Tabs, Card/Panel (incl. glow-border), ScrollArea, Table base |
| U2.7 | Toast system (incl. the rich `target-hit` variant), Banner, EmptyState |
| U2.8 | FileDropzone, Stepper |

**Exit:** every primitive has its full variant × size × state matrix on the kit page; keyboard/focus checked.

## U3 — Trading components · ~2.5 days

All components in [06 §3](../06-ui-kit-spec.md#3-trading-components).

| ID | Group |
| --- | --- |
| U3.1 | PairLabel, PriceDisplay (incl. hero odometer via Motion), PriceTicker, DeltaText |
| U3.2 | MoneyDisplay, SavingsCell, CostBreakdown (estimated / tentative / locked; fee paid by, SWIFT charges, "vendor receives"), KeyValueList |
| U3.3 | DistanceToTarget, CountdownChip, DeadlineMeter (skipped non-conversion days) |
| U3.4 | StateBadge (all states), TransferStatusPill (every `TransferStatus` + late failure), ConnectionIndicator, EnvBadge, BalancePill (available/pending/reserved tooltip) |
| U3.5 | Sparkline, StrategySummary, QuoteCard (settles date, spread vs mid) |
| U3.6 | ActivityItem (all event types), ExtractionField, BeneficiaryCard (every verification result, [13 §5.4](../13-airwallex-contracts.md#54-bank-search-validate-verify)) |

**Exit:** each component shows live behaviour through the simulator where relevant (ticking, countdowns).

## U4 — Chart · ~3 days

| ID | Task |
| --- | --- |
| U4.1 | `FxChart` wrapper around Lightweight Charts (theme from tokens, resize observer, time axis extended to the due date + padding, whitespace points) |
| U4.2 | Price-line overlays: `EntryLine`, `TargetLine` (double-draw glow), last-price label |
| U4.3 | Series primitives: `TargetZone`, `QuoteBand`, `DeadlineLine`, `DueDateLine`, `NowLine`, post-deadline hatching |
| U4.4 | `EventMarkers` with clustering; `CrosshairTooltip` (Δ entry, Δ target, cost at price) |
| U4.5 | Draggable target line (`interactive`, `onTargetDrag`) with a cost preview bubble |
| U4.6 | Inverted display; reference-history series; `range` handling; area/line/candles toggle |
| U4.7 | States: loading skeleton, empty, stale, error |
| U4.8 | `ChartHeader`, `RangeSwitcher` |
| U4.9 | Kit scenarios 1–13 ([06 §4](../06-ui-kit-spec.md#chart-scenarios-on-the-kit-page-fixtures)) incl. the live simulation and Simulate-run scenarios; `SimulatedSegment` styling |

**Exit:** 60 fps while ticking every 500 ms with 5k points; switching between 10 bill charts takes < 100 ms (instance reuse).

## U5 — Patterns + UI kit review gate · ~3 days

| ID | Task |
| --- | --- |
| U5.1 | TopBar, BillListItem, BillList (virtualised), PairGroupHeader |
| U5.2 | BillTicket (all state variants), ArmConfirm, StrategyWizardStep |
| U5.3 | ApprovalCard (all variants), ApprovalModal, TransferTracker (funding sub-row, failure category + next step, short reference) |
| U5.4 | PositionsPanel + PositionsTable (tick flash rows) |
| U5.5 | UploadModal, ExtractionReview (reason select, reference, inline `FieldError`s), **SchemaForm** (renders `BeneficiaryFormSchema`: all five field types, `refresh`, async bank search, error mapping by `path`; [13 §5.2](../13-airwallex-contracts.md#52-dynamic-form--beneficiaryformschema--schemaform)) |
| U5.6 | NotificationCenter, CommandPalette, ShortcutsSheet |
| U5.7 | DemoControlBar, SimulateButton / SimProgress, SettingsForm |
| U5.8 | **Review gate**: run the checklist in [06 §6](../06-ui-kit-spec.md#6-ui-kit-review-page), fix feedback, capture the visual baseline, record the sign-off in [09](../09-decisions-and-open-questions.md#sign-offs) |

**Exit = gate:** no page work starts until sign-off.

## U6 — Pages on mocks · ~3 days

| ID | Task |
| --- | --- |
| U6.1 | Data hooks against `DataSource` (`useBills`, `useBill`, `useChart`, `useStream`, `useApprovals`, `useBalances`) with TanStack Query; Zustand UI store (selection, layout, density) |
| U6.2 | Terminal layout grid (3 columns + bottom panel, resizable splitters, collapse right rail < 1440) with Motion `layout` transitions on selection and rail collapse |
| U6.3 | Selection + deep links `/bills/:id`; chart instance cache; `J`/`K` navigation |
| U6.4 | Ticket state machine rendering per [07 §1](../07-pages-spec.md#behaviour) |
| U6.5 | Upload → review → strategy → arm flow (mock extraction with delays and low-confidence fields); demo-only **Add sample invoices** button in `UploadModal` |
| U6.6 | Approval flows: toast → modal → approve/hold; deep link `/approvals/:id` |
| U6.7 | Keyboard shortcuts + command palette actions |
| U6.8 | Settings page; `/dev/market` control room (mock mode drives the browser simulator); the mock `DataSource` runs the Simulate timeline ([08 §1.1](../08-demo-plan.md#11-simulate-button)) end to end in the browser |
| U6.9 | Edge states from [07 §6](../07-pages-spec.md#6-states--edge-cases-all-pages) |
| U6.10 | Playwright e2e on mocks: the three demo scenarios from [08 §2](../08-demo-plan.md#2-demo-bills), plus the generator's `e2e` profile (seed 1) and a `stress` smoke (200 bills: list scroll, `J`/`K` switching) |

**Exit:** the complete demo can be performed end to end on `NEXT_PUBLIC_DATA_SOURCE=mock` with no backend running.

## U7 — Integration (with B9) · ~2 days

| ID | Task |
| --- | --- |
| U7.1 | `api` DataSource: REST client + SSE `EventSource` with reconnect/backoff + polling fallback |
| U7.2 | Optimistic updates for strategy edits, pause/resume; server-authoritative state for approvals and execution |
| U7.3 | Error envelope → toast/banner/inline mapping for every `ApiError.code` in [13 §2.1](../13-airwallex-contracts.md#21-error-codes--our-codes--ui); `fieldErrors` land on form fields |
| U7.4 | Show real Airwallex IDs (short reference first; quote and transfer UUIDs) with copy buttons |
| U7.5 | Run the e2e suite against `api` + sandbox (tagged `@sandbox`) |

## U8 — Polish · ~1.5 days

Motion polish: target-hit choreography (card glow, chart target-line pulse, toast, sequenced), list and toast enter/exit, and a pass confirming every animation is transform/opacity-only and disabled under reduced motion. Plus empty-state art, perf pass (React profiler, memoised rows), a11y pass, final visual baseline, and screenshots for the pitch deck.
