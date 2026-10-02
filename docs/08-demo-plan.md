# 08 — Demo Plan

Real FX moves slowly, and sandbox pricing is simulated, so the demo needs **controllable time and markets** while still making **real Airwallex sandbox calls** for quotes and transfers.

## 1. Demo mode building blocks

| Block | What it does | Where |
| --- | --- | --- |
| **Warp clock** | `Clock` adapter with `speed` (1×–10,000×) and `jumpTo(date)`. All deadline math, countdowns and job scheduling read from it. | `server/adapters/clock`, mirrored client-side via SSE `clock` events |
| **Simulated market** | Per-pair seeded GBM random walk (`drift`, `vol`, `tickMs`), anchored to a real starting price (a single Airwallex `rates/current` call at boot, or the latest reference rate). Supports scripted moves: `nudge(pips)`, `rampTo(price, seconds)`, `spike(pips, seconds)`. | `src/mocks/market` (shared by browser mock mode and the server `SimulatedRateSource`) |
| **Scheduler under warp** | Timers are MongoDB timestamps, and the sweeper compares them with the injected `Clock`. Under warp, the sweeper enqueues BullMQ jobs as soon as warped time passes a timer, with no special code path. | `worker/sweeper.ts` |
| **Transfer advance** | Calls `POST /simulation/transfers/{id}/transition` to move a transfer through `PROCESSING → SENT → PAID` on demand, or automatically every N seconds. | `/api/demo/transfers/:id/advance` |
| **Simulate button** | One click on a watching bill: that bill alone switches to a scripted simulated price path that crosses its target in about 12 s. The normal trigger locks a real sandbox quote and creates a real sandbox transfer, then drives it to `PAID`. About 26 s end to end. See §1.1. | `/api/demo/bills/:id/simulate`, `worker/demoSim.ts` |
| **Seed** | Creates 3 beneficiaries + 3 bills from sample invoice PDFs in `demo/invoices/`. | `pnpm seed:demo` |
| **Test-data generator** | Seeded random vendors, bank accounts, sandbox beneficiaries, invoice PDFs and bills in any state, by profile. For development, QA and rehearsals, not the stage. See [11](./11-test-data-and-seeding.md). | `pnpm seed:generate`, `/dev/market` → Test data |
| **Reset** | Drops app collections (keeps beneficiaries), obliterates the BullMQ queues, and resets the clock and market. | `/api/demo/reset` |

Demo control endpoints (`DEMO_MODE=true` only):

```
POST /api/demo/clock        { speed?: number, jumpTo?: string }
POST /api/demo/market/:pair { nudgePips?: number, rampTo?: string, seconds?: number, vol?: number, drift?: number }
POST /api/demo/scenario     { name: 'target-hit' | 'stay-watching' | 'deadline-pay' | 'insufficient-balance' }   # 'target-hit' = Simulate on demo bill 1
POST /api/demo/transfers/:id/advance { to?: 'PROCESSING'|'SENT'|'PAID'|'FAILED' }
POST /api/demo/bills/:id/simulate    { durationSec?: number, overshootBps?: number, advanceEverySec?: number }
POST /api/demo/bills/:id/simulate/stop
POST /api/demo/reset
```

The **`ConnectionIndicator` shows `SIM`** whenever the feed is simulated, so it is clear which parts are simulated. Quote and transfer IDs shown in the UI are real sandbox IDs.

### 1.1 Simulate button

**Goal:** on stage, one click makes the selected bill's price move to its target, trigger, and pay out within about half a minute. It works even when the rest of the terminal runs on the live Airwallex feed (`RATE_SOURCE=airwallex`). The real implementation stays untouched: the simulation feeds ticks into the **same** poller → strategy → executor → reconciler pipeline.

**Availability:** `DEMO_MODE=true` and (`AIRWALLEX_ENV=sandbox` or `PAYMENTS_GATEWAY=mock`), bill in `WATCHING`, no simulation already running for it. It is exposed as the `SIMULATE` action in `allowedActions`, so the button only renders when it is valid.

**Timeline (defaults):**

| t | Phase (`demo.sim` SSE) | What happens | What the audience sees |
| --- | --- | --- | --- |
| 0 s | `RAMPING` | `demo:sim:{billId}` is written to Redis; `SIM_STARTED` bill event; the bill's cooldown is cleared | "SIM" marker on the chart; the line style changes to simulated; the ticket shows "Simulating · target in 12 s" + Stop |
| 0–12 s | `RAMPING` | 1 s simulated ticks for this bill only, easing from the last real price to `target × (1 − overshootBps)` with shrinking noise | Price slides into the orange target zone |
| ~13 s | `TRIGGERED` | The normal trigger rules pass (2 confirm ticks) → real sandbox quote → `EXECUTING`, event `QUOTE_LOCKED` | Target-hit pulse + toast "Target hit · paying" |
| ~16 s | `EXECUTING` | The same job creates the sandbox transfer with the quote | `TransferTracker` shows the real transfer ID |
| ~19 / 22 / 25 s | `SETTLING` | Every `advanceEverySec` (3 s): simulation transition to `PROCESSING` → `SENT` → `PAID`, then an immediate `GET /transfers/{id}` applied through `applyTransferStatus` (no waiting for webhooks) | Tracker steps through to **Paid** |
| ~26 s | `DONE` | Redis key deleted; `SIM_ENDED` bill event | Receipt |

**Price path:** `p(t) = from + (to − from) × easeInOutCubic(t / T) + noise(t)`. `from` is the bill's last real price (so the chart doesn't jump), `to = target × (1 − overshootBps / 10 000)` (default 5 bps past the target), and noise is seeded GBM noise whose amplitude falls to 0 near `T`. After `T` the price holds just past the target (mean-reverting, never back above it) until the bill leaves `WATCHING`. Ticks are stored with `meta.source = 'SIMULATED'` and `meta.simId`, so the chart can style that segment.

**One demo-only relaxation** (tagged `DEMO-ONLY:` in code, listed in §5):

**Quote check.** Normally a target hit requires the real quote price ≤ target ([03 §3](./03-domain-model.md#3-trigger-rules)). The real sandbox quote tracks the real market, not our simulated one, so it would always be a near miss. When the triggering tick is simulated (a Simulate run, or `RATE_SOURCE=simulated` in hybrid mode), the check compares the **simulated** price instead. The `QUOTE_LOCKED` event and the receipt show both numbers: "Triggered at 1.07952 (simulated) · Airwallex quote 1.08810 (actual)". The transfer always executes at the real quote. The payment itself is the normal execute path: the same job locks the quote and creates the transfer.

**Where it runs:** a `demoSim` loop in the worker (1 s, only while any `demo:sim:*` key exists, and only on the leader). It produces the ticks and advances the transfer. The trigger pays through the normal execute path. It uses wall-clock seconds even under a time warp, so the on-stage pacing stays the same. A per-bill `RoutingRateSource` gives the simulated ticks for sim bills and the configured source for everything else, so other bills (including ones on the same pair) stay live.

**Stop and failure:** "Stop" (or `/simulate/stop`) deletes the key, writes `SIM_ENDED { aborted: true }`, and returns the bill to the live feed on the next poll; the chart shows the jump back at the marker. If the quote, the balance check or the transfer fails, the sim stops and the normal error UI takes over. The Redis key has a 10-minute TTL, so an orphaned sim can't linger.

**Mock mode:** with `NEXT_PUBLIC_DATA_SOURCE=mock`, the mock `DataSource` runs the same timeline in the browser (a mock quote at the simulated price, mock transfer statuses), so the button can be built and reviewed on the UI track before the backend exists.

## 2. Demo bills

| # | Vendor | Bill | Due | Strategy | Scripted outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | Acme GmbH (DE) | EUR 250,000 | +12 days | Target −0.8% | **Simulate** → price crosses the target → transfer → **Paid** |
| 2 | Northwind Ltd (UK) | GBP 120,000 | +20 days | Max cost | Stays **watching**. Pause it, or edit the target. A near miss (quote worse than the target) also stays watching |
| 3 | Bharat Textiles (IN) | INR 8,500,000 | +3 days | Target −1.5% (unreachable) | Jump to the deadline day → still watching → **pays at the cutoff** under the standing instruction |

Bill 3 is intentionally a **buy-only currency** to show the single-call convert-and-pay path.

## 3. Run of show (≈ 5 min)

| t | Beat | Action | What the audience sees |
| --- | --- | --- | --- |
| 0:00 | Hook | Terminal open with 0 bills | Glowing empty terminal: "Every bill is a position." |
| 0:20 | Upload | Drop 3 invoice PDFs | Parallel extraction progress; review screen with confidence highlights |
| 1:00 | Review & arm | Fix one low-confidence field, create the beneficiary, set targets (drag the target line), accept the standing instruction | Entry and target lines appear; the deadline lines sit in the future |
| 1:45 | Switch markets | `J`/`K` through the bills | Instant chart switch, like perps markets |
| 2:00 | Target hit → Paid | Select the EUR bill, press **Simulate** (§1.1) | Price slides into the orange zone → pulse → toast "Target hit · paying" → **real Airwallex quote and transfer IDs** → Processing → Sent → **Paid**, all in about 26 s |
| 2:40 | Still watching | GBP bill: pause it, or drag the target | The bill stays `WATCHING`. A near-miss marker if a quote comes back worse than the target |
| 3:50 | Deadline | Time warp to the INR bill's deadline day | Still watching. The deadline meter shows it pays at market at the cutoff |
| 4:20 | Cutoff | Let the cutoff pass | Pays at market under the standing instruction → transfer → Paid |
| 4:45 | Close | Executed tab, then the watching book | Two bills paid, one still watching |

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
| Warp clock (`CLOCK=warp`) | `DEMO-ONLY` | `src/mocks/market`, `server/adapters/clock` | System clock; demo endpoints removed |
| Jump to deadline pays that bill immediately | `DEMO-ONLY` | `src/mocks/mock-data-source.ts` `jumpToDeadline` | The sweeper pays from the stored cutoff |
| `/dev/*` and `/api/demo/*` routes | `DEMO-ONLY` | `src/app/dev`, `src/app/api/demo` | Not deployed (`DEMO_MODE=false`) |
| Standing instruction is a single checkbox at arming | `DEMO-ONLY` | `ArmConfirm`, `arm` service | A formal payment mandate with limits, stored with an audit trail |
| Seeded bills use cached extraction results | `DEMO-ONLY` | `scripts/seed-demo` | Live extraction; human review is always required |
| Generated vendors, bank accounts and invoices; mock extractor returns truth by file hash | `DEMO-ONLY` | `src/mocks/generators`, `scripts/generate`, mock `BillExtractor` | Real vendor onboarding and live extraction |
| Uploads on a local Docker volume | `DEMO-ONLY` | uploads storage adapter | Encrypted object storage with retention rules |
| Single server, one worker (single point of failure) | `DEMO-ONLY` | `docs/10` | Multi-instance web, managed Redis, `DEADLINE_SAFETY_NET=airwallex` |
| Transfer status advanced by the simulation endpoint | `SANDBOX` | `src/mocks/mock-data-source.ts`, `simulation.ts`, `/api/demo/transfers/:id/advance` | Real payout lifecycle via webhooks + reconciler |
| Pre-funded wallet topped up by deposit simulation | `SANDBOX` | `/api/demo/scenario`, seed scripts | Real funding; low-balance alerts before the deadline day |
| Sandbox FX pricing is simulated, so quote rates may not track the market | `SANDBOX` | quote adapter, receipt, `QUOTE_LOCKED` event | Real quotes; show the trigger rate and the quote rate side by side |
| Simulate button: per-bill scripted price path | `DEMO-ONLY` | `src/mocks/mock-data-source.ts`, `worker/demoSim.ts`, `RoutingRateSource` | Removed; triggers only from real ticks |
| Simulated trigger compares the simulated price to the target, then pays on the normal execute path | `DEMO-ONLY` | `src/mocks/mock-data-source.ts`, strategy engine (simulated ticks only) | Always require `p_quote ≤ p_target`; the same job still locks the quote and creates the transfer |
| Activity feed includes simulation started and ended | `DEMO-ONLY` | `ActivityItem` | Production activity has no simulation events |
| Chart shows simulation markers and a kit Simulate replay | `DEMO-ONLY` | `EventMarkers`, `scenario-simulate` | Production charts have no simulation markers or replay |
| Demo control bar and the ticket Simulate button | `DEMO-ONLY` | `DemoControlBar`, `SimulateButton` | Removed; no simulated market, warp, or scripted target hit |
| Upload offers generated sample invoices | `DEMO-ONLY` | `UploadModal` | Only real uploaded documents are extracted |
| Sim reads transfer status immediately instead of waiting for webhooks | `SANDBOX` | `worker/demoSim.ts` | Webhooks + reconciler |
