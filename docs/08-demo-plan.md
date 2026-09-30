# 08 — Demo Plan

Real FX moves slowly, and sandbox pricing is simulated, so the demo needs **controllable time and markets** while still making **real Airwallex sandbox calls** for quotes and transfers.

## 1. Demo mode building blocks

| Block | What it does | Where |
| --- | --- | --- |
| **Warp clock** | `Clock` adapter with `speed` (1×–10,000×) and `jumpTo(date)`. All deadline math, countdowns and job scheduling read from it. | `server/adapters/clock`, mirrored client-side via SSE `clock` events |
| **Simulated market** | Per-pair seeded GBM random walk (`drift`, `vol`, `tickMs`), anchored to a real starting price (a single Airwallex `rates/current` call at boot, or the latest reference rate). Supports scripted moves: `nudge(pips)`, `rampTo(price, seconds)`, `spike(pips, seconds)`. | `src/mocks/market` (shared by browser mock mode and the server `SimulatedRateSource`) |
| **Scheduler under warp** | Timers are MongoDB timestamps, and the sweeper compares them with the injected `Clock`. Under warp, the sweeper enqueues BullMQ jobs as soon as warped time passes a timer, with no special code path. | `worker/sweeper.ts` |
| **Transfer advance** | Calls `POST /simulation/transfers/{id}/transition` to move a transfer through `PROCESSING → SENT → PAID` on demand, or automatically every N seconds. | `/api/demo/transfers/:id/advance` |
| **Simulate button** | One click on a watching bill: that bill alone switches to a scripted simulated price path that crosses its target in about 12 s. The normal trigger locks a real sandbox quote, the system auto-approves, a real sandbox transfer is created and driven to `PAID`. About 26 s end to end. See §1.1. | `/api/demo/bills/:id/simulate`, `worker/demoSim.ts` |
| **Seed** | Creates 3 beneficiaries + 3 bills from sample invoice PDFs in `demo/invoices/`. | `pnpm seed:demo` |
| **Test-data generator** | Seeded random vendors, bank accounts, sandbox beneficiaries, invoice PDFs and bills in any state, by profile. For development, QA and rehearsals, not the stage. See [11](./11-test-data-and-seeding.md). | `pnpm seed:generate`, `/dev/market` → Test data |
| **Reset** | Drops app collections (keeps beneficiaries), obliterates the BullMQ queues, and resets the clock and market. | `/api/demo/reset` |

Demo control endpoints (`DEMO_MODE=true` only):

```
POST /api/demo/clock        { speed?: number, jumpTo?: string }
POST /api/demo/market/:pair { nudgePips?: number, rampTo?: string, seconds?: number, vol?: number, drift?: number }
POST /api/demo/scenario     { name: 'target-hit' | 'reject-rearm' | 'deadline-autosettle' | 'insufficient-balance' }   # 'target-hit' = Simulate on demo bill 1
POST /api/demo/transfers/:id/advance { to?: 'PROCESSING'|'SENT'|'PAID'|'FAILED' }
POST /api/demo/bills/:id/simulate    { durationSec?: number, overshootBps?: number, autoApproveDelaySec?: number, advanceEverySec?: number }
POST /api/demo/bills/:id/simulate/stop
POST /api/demo/reset
```

The **`EnvBadge` shows `DEMO · SIMULATED MARKET`** whenever `RATE_SOURCE=simulated`, so it is clear which parts are simulated. Quote and transfer IDs shown in the UI are real sandbox IDs.

### 1.1 Simulate button

**Goal:** on stage, one click makes the selected bill's price move to its target, trigger, get approved and pay out within about half a minute. It works even when the rest of the terminal runs on the live Airwallex feed (`RATE_SOURCE=airwallex`). The real implementation stays untouched: the simulation feeds ticks into the **same** poller → strategy → approval → executor → reconciler pipeline.

**Availability:** `DEMO_MODE=true` and (`AIRWALLEX_ENV=sandbox` or `PAYMENTS_GATEWAY=mock`), bill in `WATCHING`, no simulation already running for it. It is exposed as the `SIMULATE` action in `allowedActions`, so the button only renders when it is valid.

**Timeline (defaults):**

| t | Phase (`demo.sim` SSE) | What happens | What the audience sees |
| --- | --- | --- | --- |
| 0 s | `RAMPING` | `demo:sim:{billId}` is written to Redis; `SIM_STARTED` bill event; the bill's cooldown is cleared | "SIM" marker on the chart; the line style changes to simulated; the ticket shows "Simulating · target in 12 s" + Stop |
| 0–12 s | `RAMPING` | 1 s simulated ticks for this bill only, easing from the last real price to `target × (1 − overshootBps)` with shrinking noise | Price slides into the orange target zone |
| ~13 s | `TRIGGERED` | The normal trigger rules pass (2 confirm ticks) → real sandbox quote → `TARGET_HIT` + approval | Target-hit pulse + toast "Target hit · quote locked" |
| ~15 s | `AUTO_APPROVED` | After `autoApproveDelaySec` (2 s) the sim driver calls the normal approve service as `system:demo-sim` | Approval card flips to "Auto-approved (simulation)" |
| ~16 s | `EXECUTING` | Executor pre-flight + real sandbox `transfers/create` with the quote | `TransferTracker` shows the real transfer ID |
| ~19 / 22 / 25 s | `SETTLING` | Every `advanceEverySec` (3 s): simulation transition to `PROCESSING` → `SENT` → `PAID`, then an immediate `GET /transfers/{id}` applied through `applyTransferStatus` (no waiting for webhooks) | Tracker steps through to **Paid** |
| ~26 s | `DONE` | Redis key deleted; `SIM_ENDED` bill event | Receipt |

**Price path:** `p(t) = from + (to − from) × easeInOutCubic(t / T) + noise(t)`. `from` is the bill's last real price (so the chart doesn't jump), `to = target × (1 − overshootBps / 10 000)` (default 5 bps past the target), and noise is seeded GBM noise whose amplitude falls to 0 near `T`. After `T` the price holds just past the target (mean-reverting, never back above it) until the bill leaves `WATCHING`. Ticks are stored with `meta.source = 'SIMULATED'` and `meta.simId`, so the chart can style that segment.

**Two demo-only relaxations** (tagged `DEMO-ONLY:` in code, listed in §5):
1. **Quote check.** Normally `TARGET_HIT` requires the real quote price ≤ target ([03 §3](./03-domain-model.md#3-trigger-rules)). The real sandbox quote tracks the real market, not our simulated one, so it would always be a near miss. When the triggering tick is simulated (a Simulate run, or `RATE_SOURCE=simulated` in hybrid mode), the check compares the **simulated** price instead. The approval card and the receipt show both numbers: "Triggered at 1.07952 (simulated) · Airwallex quote 1.08810 (actual)". The transfer always executes at the real quote.
2. **Auto-approval.** The sim driver approves on the user's behalf. It uses the normal approve service (valid quote required, same transaction, same guards) with the actor `system:demo-sim`, and the `APPROVED` event records `{ auto: true, simId }`. It only approves approvals created from a sim tick.

**Where it runs:** a `demoSim` loop in the worker (1 s, only while any `demo:sim:*` key exists, and only on the leader). It produces the ticks, auto-approves when due, and advances the transfer. It uses wall-clock seconds even under a time warp, so the on-stage pacing stays the same. A per-bill `RoutingRateSource` gives the simulated ticks for sim bills and the configured source for everything else, so other bills (including ones on the same pair) stay live.

**Stop and failure:** "Stop" (or `/simulate/stop`) deletes the key, writes `SIM_ENDED { aborted: true }`, and returns the bill to the live feed on the next poll; the chart shows the jump back at the marker. If the quote, the balance check or the transfer fails, the sim stops and the normal error UI takes over. The Redis key has a 10-minute TTL, so an orphaned sim can't linger.

**Mock mode:** with `NEXT_PUBLIC_DATA_SOURCE=mock`, the mock `DataSource` runs the same timeline in the browser (a mock quote at the simulated price, mock transfer statuses), so the button can be built and reviewed on the UI track before the backend exists.

## 2. Demo bills

| # | Vendor | Bill | Due | Strategy | Scripted outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | Acme GmbH (DE) | EUR 250,000 | +12 days | Target −0.8% | **Simulate** → price crosses the target → auto-approve → transfer → **Paid** |
| 2 | Northwind Ltd (UK) | GBP 120,000 | +20 days | Max cost | Target hit → approver **holds for better** → price keeps falling → second hit → approve |
| 3 | Bharat Textiles (IN) | INR 8,500,000 | +3 days | Target −1.5% (unreachable) | Jump to deadline day → approval requested → ignored → **auto-settle** at the cutoff (standing instruction) |

Bill 3 is intentionally a **buy-only currency** to show the single-call convert-and-pay path.

## 3. Run of show (≈ 5 min)

| t | Beat | Action | What the audience sees |
| --- | --- | --- | --- |
| 0:00 | Hook | Terminal open with 0 bills | Glowing empty terminal: "Every bill is a position." |
| 0:20 | Upload | Drop 3 invoice PDFs | Parallel extraction progress; review screen with confidence highlights |
| 1:00 | Review & arm | Fix one low-confidence field, create the beneficiary, set targets (drag the target line), accept the standing instruction | Entry and target lines appear; the deadline lines sit in the future |
| 1:45 | Switch markets | `J`/`K` through the bills | Instant chart switch, like perps markets |
| 2:00 | Target hit → Paid | Select the EUR bill, press **Simulate** (§1.1) | Price slides into the orange zone → pulse → toast "Target hit · quote locked" → auto-approved → **real Airwallex quote and transfer IDs** → Processing → Sent → **Paid**, all in about 26 s |
| 2:40 | Human approval | GBP bill hits (scenario `reject-rearm`); switch to Approver, press `H` | Rejected marker; price keeps falling; second hit; press `A` and approve at a better price. This beat shows that outside the simulation a person always approves |
| 3:50 | Deadline | Time warp to the INR bill's deadline day | Amber final-day state, auto-settle countdown |
| 4:20 | Auto-settle | Let the cutoff pass | ⚡ Auto-settled under standing instruction → transfer → Paid |
| 4:45 | Close | Executed tab | Three bills paid, savings summary vs entry |

## 4. Rehearsal checklist

- [ ] Sandbox wallet has enough USD (≥ 1,000,000). Top up via deposit simulation if needed.
- [ ] Webhook tunnel is up; test event received
- [ ] `pnpm airwallex:smoke` all green on the day
- [ ] `pnpm seed:demo` from a clean reset
- [ ] Simulate run end to end on a throwaway bill reaches **Paid** in < 40 s (checks the quote, balance, transfer and simulation endpoints together); then reset
- [ ] Browser at 1440 × 900 or 1920 × 1080, zoom 100%, notifications muted
- [ ] Fallback: if Airwallex is unreachable, switch to `PAYMENTS_GATEWAY=mock` (UI marks "MOCK GATEWAY") and continue

## 5. Demo vs production inventory

Every shortcut is tagged in code with `DEMO-ONLY:` + `PROD:` or `SANDBOX:` (see `.cursor/rules/demo-comment-tags.mdc`). Adding a new `DEMO-ONLY:` adds a row here in the same commit. Audit: `rg -n "DEMO-ONLY:|SANDBOX:" src scripts`.

| Shortcut | Tag | Where | Production approach |
| --- | --- | --- | --- |
| Simulated market drives the chart and triggers (`RATE_SOURCE=simulated`) | `DEMO-ONLY` | `src/mocks/market`, `server/adapters/rates/simulated` | Poll bill-sized `rates/current`; triggers only from real ticks |
| Warp clock (`CLOCK=warp`) | `DEMO-ONLY` | `server/adapters/clock` | System clock; demo endpoints removed |
| Role switcher instead of real auth; anyone can be the approver | `DEMO-ONLY` | session helper, `TopBar` | SSO/real auth, approver permissions, approval limits and dual control |
| `/dev/*` and `/api/demo/*` routes | `DEMO-ONLY` | `src/app/dev`, `src/app/api/demo` | Not deployed (`DEMO_MODE=false`) |
| Standing instruction is a single checkbox at arming | `DEMO-ONLY` | `ArmConfirm`, `arm` service | A formal payment mandate with limits, stored with an audit trail |
| Seeded bills use cached extraction results | `DEMO-ONLY` | `scripts/seed-demo` | Live extraction; human review is always required |
| Generated vendors, bank accounts and invoices; mock extractor returns truth by file hash | `DEMO-ONLY` | `src/mocks/generators`, `scripts/generate`, mock `BillExtractor` | Real vendor onboarding and live extraction |
| Uploads on a local Docker volume | `DEMO-ONLY` | uploads storage adapter | Encrypted object storage with retention rules |
| Single server, one worker (single point of failure) | `DEMO-ONLY` | `docs/10` | Multi-instance web, managed Redis, `DEADLINE_SAFETY_NET=airwallex` |
| Transfer status advanced by the simulation endpoint | `SANDBOX` | `simulation.ts`, `/api/demo/transfers/:id/advance` | Real payout lifecycle via webhooks + reconciler |
| Pre-funded wallet topped up by deposit simulation | `SANDBOX` | `/api/demo/scenario`, seed scripts | Real funding; low-balance alerts before the deadline day |
| Sandbox FX pricing is simulated, so quote rates may not track the market | `SANDBOX` | quote adapter, `ApprovalCard` | Real quotes; show the trigger rate and the quote rate side by side |
| Simulate button: per-bill scripted price path | `DEMO-ONLY` | `worker/demoSim.ts`, `RoutingRateSource` | Removed; triggers only from real ticks |
| Simulated trigger skips the "real quote ≤ target" check | `DEMO-ONLY` | strategy engine (simulated ticks only) | Always require `p_quote ≤ p_target` |
| Simulated trigger is auto-approved by `system:demo-sim` | `DEMO-ONLY` | `worker/demoSim.ts` → approve service | Human approval only (or the standing instruction at the cutoff) |
| Sim reads transfer status immediately instead of waiting for webhooks | `SANDBOX` | `worker/demoSim.ts` | Webhooks + reconciler |
