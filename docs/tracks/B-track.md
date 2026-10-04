# B — Backend & Integration Track

**Goal:** a reliable worker and API that watch rates, lock quotes, pay when the target is hit or at the deadline, and execute real Airwallex sandbox transfers, all behind the same contracts the UI was built on.

**References:** [01 Feasibility](../01-feasibility-airwallex.md) · [02 Architecture](../02-architecture.md) · [03 Domain model](../03-domain-model.md) · [04 Airwallex integration](../04-airwallex-integration.md) · [13 Airwallex → Contracts & UI](../13-airwallex-contracts.md) · [08 Demo plan](../08-demo-plan.md)

**Rules for the whole track**
- The domain (`server/domain`) is pure and unit-tested. I/O lives in adapters and services.
- Every bill state change goes through `transition()`: one atomic conditional `findOneAndUpdate` (allowed-from states + `version`), followed by a `bill_events` insert. Multi-document transactions are used only where [02 §9.3](../02-architecture.md#93-consistency-without-row-locks) says so.
- Background work runs through BullMQ with deterministic `jobId`s. Nothing time-based depends on BullMQ delayed jobs; timers live in MongoDB and the sweeper enqueues them.
- Every Airwallex `POST` create carries a deterministic `request_id`.
- `decimal.js` for all money and rates. Round to currency precision at the edges.
- Each external dependency has a `mock` adapter. `pnpm test` does not need credentials, Docker, or a database the user started.
- **Do not set up hosting.** No Docker, Compose, Caddy, Dockerfiles, image builds, or deploy scripts. The user deploys by hand. [10](../10-deployment.md) is not a task on this track.

## Environment

Tests start their own databases (see Test strategy). Ask the user, and wait, only at the rows below. Do not invent values, and do not install MongoDB or Redis to unblock a row.

| Before | Ask for | If they defer |
| --- | --- | --- |
| B2.1 (first sandbox call) | `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY` in `.env` | Stop. B0–B1 and the later service tests do not need them. |
| B2.2, V13 only | `AIRWALLEX_GLOBAL_ACCOUNT_ID` (a sandbox Global Account in USD) | Record V13 as blocked in `docs/verification-results.md` and continue. |
| B2.3 | `AIRWALLEX_WEBHOOK_SECRET`, and the public base URL of a tunnel the user has already started | Skip the live delivery check. Signature unit tests still run with a fixture secret. |
| B4.2b (`pnpm test:extraction` against Claude) | `ANTHROPIC_API_KEY` | Land the pipeline on the `mock` extractor and leave the benchmark unchecked. |
| B9.5, B9.6 sandbox timing check, B10.3 soak | The Airwallex values above, plus `MONGODB_URI` and `REDIS_URL` for a MongoDB replica set and Redis the user is already running | Run the same path with `PAYMENTS_GATEWAY=mock` against the in-memory servers. |

Estimates are for one engineer.

---

## B0 — Backend foundations · ~1 day

| ID | Task | Done when |
| --- | --- | --- |
| B0.1 | `.env.example` (see [02 §8](../02-architecture.md#8-environment-variables)) and zod env validation at boot. Test harness: `mongodb-memory-server` in replica-set mode and `redis-memory-server`, started and stopped by Vitest. No Docker. | A service test boots both, runs the execution-create transaction, and runs a BullMQ job. The real process fails fast when a required variable is missing. Tests inject the memory URIs and do not read the user's `.env`. |
| B0.2 | Mongoose connection singleton (safe for Next.js hot reload), `Decimal128` ↔ string `toJSON` plugin, all models in [03 §4](../03-domain-model.md#4-data-model-mongodb--mongoose) incl. the `rate_ticks` time-series collection; `pnpm db:indexes` runs `syncIndexes()` | The index sync runs against the memory replica set; partial unique indexes are verified by a test |
| B0.3 | Worker entry (`pnpm worker`): BullMQ queues/workers per [02 §9.2](../02-architecture.md#92-queues-srcserverqueue), sweeper loop, Redis leader lock for the poller and sweeper, graceful shutdown (drain workers, close Redis/Mongo) | Against the memory Redis: the worker starts and stops cleanly, a second worker does not take the lock, and a job remains after the worker process restarts |
| B0.4 | Event bus: `publish(event)` → Redis `PUBLISH app_events`; the SSE route (`/api/stream`) holds one shared subscriber connection per process and fans out | An event published in the worker shows up in the browser |
| B0.5 | Structured logging (pino) with redaction; request IDs | Logs are JSON with `trace_id` for Airwallex calls |
| B0.6 | `Clock` adapter (`system` \| `warp`) injected everywhere time is read | No direct `new Date()` in domain/services (lint rule) |

## B1 — Airwallex client · ~2 days

| ID | Task |
| --- | --- |
| B1.1 | `client.ts`: base URLs, `x-api-version` (per-endpoint-group override map), **lossless JSON parsing** (amounts arrive as JSON numbers), `parseAwxTimestamp`, `AirwallexError` with `fieldErrors` and code aliases (`quote_expired`/`expired_quote`, `duplicate_request_id`/`request_id_duplicate`, …) per [13 §1–2](../13-airwallex-contracts.md#1-wire-conventions) |
| B1.2 | `auth.ts`: login, cached token, single-flight refresh 60 s before `expires_at`, `x-login-as` support |
| B1.3 | `limiter.ts`: token bucket (global 15 rps, per-endpoint 8 rps by default; configurable), 429 backoff with jitter |
| B1.4 | Endpoints: rates, quotes, conversions (`/fx/conversions/*`), transfers (create/validate/get/cancel/list), beneficiaries (create/get/list/validate/verify_account, API + form schema, supported financial institutions), balances (current/history), reference (supported currencies, invalid conversion dates, quota), simulation (transition, deposit); files and spend behind flags |
| B1.5 | `mappers.ts` per [13](../13-airwallex-contracts.md): canonical price (`CLIENT.sell_amount / buy_amount`), `orient()` for market-convention rates, transfer → `ExecutionSummary` (funding, fees, tentative amounts, failure category), quote → `QuoteSummary`, balances, form schema → `BeneficiaryFormSchema`, verification → `AccountVerification`. The same transfer mapper handles webhook `data.object`. Error mapping → `ApiError` ([13 §2.1](../13-airwallex-contracts.md#21-error-codes--our-codes--ui)) |
| B1.6 | `webhooks.ts`: raw-body HMAC-SHA256 verification (constant-time) + timestamp tolerance + event parsing |
| B1.7 | `mock` implementations of `RateSource`, `QuoteProvider`, `PaymentsGateway` with realistic latencies and failure injection |

**Exit:** unit tests for auth caching, retries/idempotency, the price mapper and signature verification.

## B2 — Sandbox verification (gate) · ~1 day

Ask for the Airwallex values in the Environment table before B2.1. Do not call the sandbox until they are in `.env`.

| ID | Task |
| --- | --- |
| B2.1 | `pnpm airwallex:smoke`: scripted checks **V1–V10 and V14–V17** (V12/V13 run in B2.2) from [01 §7](../01-feasibility-airwallex.md#7-verification-checklist-run-in-sandbox-during-b1b2); prints a pass/fail table, writes `docs/verification-results.md`, and records redacted raw responses to `src/server/adapters/airwallex/__fixtures__/` (mapper tests and C0.3 fixtures use these, not the docs examples) |
| B2.2 | `pnpm seed:beneficiaries`: EUR (IBAN), GBP (sort code), JPY, SGD, INR sandbox beneficiaries; uses the API schema to build valid payloads. Run V12 (which generated bank details the sandbox accepts) and V13 (deposit simulation) here, and record the per-corridor bank-id allowlist in `src/mocks/generators/corridors.ts` |
| B2.3 | Webhook subscription set up through a tunnel; a test event is received and verified |
| B2.4 | Record the answers to Q-01, Q-02, Q-10 in [09](../09-decisions-and-open-questions.md); update decisions D-03/D-04/D-07 if the results change them |

**Exit = gate:** V1, V2, V4, V5, V8 and V9 pass (these are blocking). The others are recorded.

## B3 — Domain core · ~2 days

| ID | Task |
| --- | --- |
| B3.1 | `rateMath.ts`: price, cost, savings, distance, max-cost ↔ target conversion, rounding; property-based tests |
| B3.2 | `stateMachine.ts`: states/events per [03 §1](../03-domain-model.md#1-bill-lifecycle-state-machine), guards, invariants; exhaustive transition table tests |
| B3.3 | `deadline.ts`: execution deadline (business days, account tz) and the cutoff instant; DST tests for `Australia/Melbourne`, `Europe/London`, `America/Los_Angeles` |
| B3.4 | `trigger.ts`: threshold, confirmation ticks, freshness, cooldown, re-arm improvement |
| B3.5 | Repositories (Mongoose, `lean()` reads mapped to contracts) + `transition()` service: conditional `findOneAndUpdate` with `version`, event append, publish; the transactional helper for execution-create |
| B3.6 | REST routes for bills CRUD, strategy, arm/pause/resume/cancel, events, balances (per [03 §6](../03-domain-model.md#6-internal-rest-api)), validating with the contracts |

## B4 — Bill ingestion · ~2 days

| ID | Task |
| --- | --- |
| B4.1 | `POST /api/uploads`: multipart, many files, stored under `storage/` (local disk for the demo; S3-compatible adapter optional); creates `DRAFT` bills |
| B4.2 | Extraction pipeline per [12](../12-bill-extraction.md): preflight + SHA-256 cache, deterministic readers (e-invoice XML, EPC/Swiss QR, text layer), `anthropic` extractor (PDF `document` block, JSON-schema structured output, Haiku → Sonnet escalation), merge, validators, evidence → boxes. Plus the `mock` extractor (generator truth by file hash, [11 §4](../11-test-data-and-seeding.md#4-invoice-rendering)) and the optional `ollama` adapter |
| B4.2b | Benchmark with `pnpm test:extraction` ([12 §5](../12-bill-extraction.md#5-benchmark-and-gates)) across Haiku-only / escalation / Sonnet-only; tune the prompt until the gates pass; record the chosen default in D-15. Ask for `ANTHROPIC_API_KEY` first (Environment table). |
| B4.3 | BullMQ `extraction` queue (concurrency 4, `jobId: extract.{documentId}`); progress events over SSE |
| B4.4 | Validation: currency payable (static capability table overridden by `supported_currencies`), payout precision, FX amount limits ($1–$5M default), IDR/VND quota, due date, duplicate invoice detection (vendor + invoice # + amount). On arm: `transfers/validate` dry run → `FieldError[]` ([13 §4.4](../13-airwallex-contracts.md#44-validation-at-arming)) |
| B4.5 | Beneficiary resolution: match existing (name / IBAN / account number), or create through the Airwallex API: form-schema proxy (cached 24 h), bank search proxy, `beneficiaries/validate`, create, then `verify_account` where supported (SEPA/UK/VN); store only masked fields + verification result ([13 §5](../13-airwallex-contracts.md#5-beneficiaries)) |
| B4.7 | Reference data: `supported_currencies`, `invalid_conversion_dates` per pair (fed to `subtractBusinessDays`), quota; Redis cache 24 h; `GET /api/reference/*` routes |
| B4.6 | Optional: upload the original to the Airwallex Files API (`SPEND_SYNC` flag) |

## B5 — Market data & realtime · ~2 days

| ID | Task |
| --- | --- |
| B5.1 | `RateSource`: `airwallex` (bill-sized `rates/current`) and `simulated` (server-side use of `src/mocks/market`, anchored on one real rate at boot) |
| B5.2 | Poller: schedules each `WATCHING`/`PAUSED` bill every `POLL_INTERVAL_MS`, shares the limiter, marks stale feeds; coalesces by `(F, H, amount)` |
| B5.3 | Tick store in the `rate_ticks` time-series collection (TTL 30 days) + repeatable BullMQ job writing 1-minute rollups into `rate_candles_1m`; chart aggregation with `$dateTrunc` |
| B5.4 | `HistorySource`: Frankfurter daily series cached in a `reference_rates` collection; `none` fallback sets `flags.noReferenceHistory` |
| B5.5 | `GET /api/bills/:id/chart?range=`: merges reference + own ticks/candles, builds `ChartOverlays` (entry, target, quote band, deadline, due, now, markers from `bill_events`) |
| B5.6 | SSE event serialisation per [02 §6](../02-architecture.md#6-realtime-events-sse); heartbeat every 15 s; per-client backpressure |

## B6 — Strategy engine, quotes & execution · ~2.5 days

| ID | Task |
| --- | --- |
| B6.1 | The strategy engine subscribes to ticks and evaluates the trigger rules for `WATCHING` bills |
| B6.2 | On trigger: lock the quote (`QUOTE_VALIDITY_TARGET`), re-check it against the target → `EXECUTING` in the same job, or a `NEAR_MISS` event that stays `WATCHING` |
| B6.3 | Cancel from `DRAFT`/`READY`/`WATCHING`/`PAUSED`. There is no approve or hold endpoint |
| B6.4 | Quote expires before the transfer is created → stay `WATCHING` and retry (`quote-retry.{billId}`) |
| B6.5 | "Pay now" locks a `MIN_1` quote and enqueues execution with mode `MANUAL` |
| B6.6 | Notifier: in-app only (SSE `notification` → toast + `NotificationCenter`, deep link `/bills/:id`; Q-05); messages for target hit (paying), deadline payment, paid, failed |
| B6.7 | Strategy edits while `WATCHING`: recompute the target (max-cost mode), re-evaluate immediately, log `STRATEGY_UPDATED` |

## B7 — Deadline scheduler & auto-settle · ~2 days

| ID | Task |
| --- | --- |
| B7.1 | At arming: compute the cutoff and write `timers.autosettleAt` on the bill; recompute on due-date/lead-day edits (clearing `autosettleFiredAt` if the timer moves into the future). If the deadline is already past, go straight to `EXECUTING` |
| B7.2 | `deadline.autosettle`: if the bill is still `WATCHING` or `PAUSED`, lock a `MIN_1` quote and execute with mode `DEADLINE` |
| B7.3 | If that quote cannot be locked, stay `WATCHING` and let the sweeper retry |
| B7.4 | Pay-now and the cutoff share the executor. Mode is `MANUAL` or `DEADLINE`; a target hit is `TARGET` |
| B7.5 | Sweeper (`worker/sweeper.ts`): every 1 s, query due `autosettleAt` timers against `clock.now()` and add the `deadline.autosettle.{billId}` job; log `CATCH_UP` when a timer is more than 1 min late (restart recovery) |
| B7.6 | Warp-clock check: at 1,000× the sweeper fires deadline actions in the right order, and no timer fires twice (tests with a fake clock) |
| B7.7 | *(Flag `DEADLINE_SAFETY_NET=airwallex`)* Layer B: create a future-dated transfer with `lock_rate_on_create=false` on arming; cancel it when another path executes; surface its ID in the ticket |

## B8 — Execution, webhooks & reconciliation · ~2.5 days

| ID | Task |
| --- | --- |
| B8.1 | Executor job: pre-flight balance check → optional `transfers/validate` → `transfers/create` with `quote_id` and `request_id = tr:{billId}:{attempt}` → `executions` document (transaction with the bill transition) → `IN_FLIGHT` |
| B8.2 | Error policy per [04 §2.3](../04-airwallex-integration.md#23-transfer-with-conversion-primary-execution-path) and [13 §2.1](../13-airwallex-contracts.md#21-error-codes--our-codes--ui) (`quote_expired`, `quote_id_invalid`, duplicate `request_id` → fetch `details.id`, 409 `request_pending`, `balance_insufficient`, limits, retryable) |
| B8.3 | Webhook route: verify → `webhook_events` insert with `_id` = event id (a `11000` duplicate-key error means already received) → `200` immediately → add a BullMQ `webhook` job |
| B8.4 | Webhook processor: map `payout.transfer.*`, `payout.transfer.funding.*` and `conversion.*` → execution + bill state (monotonic rank; `FAILED` overrides `PAID`; the auto-`CANCELLED` after `FAILED` is ignored; `updated_at` ordering; [13 §4.3](../13-airwallex-contracts.md#43-status-maps)); balance events refresh the balance cache |
| B8.5 | Reconciler (repeatable BullMQ job): every 60 s poll non-terminal executions via `GET /transfers/{id}`; resolve `EXECUTING` bills with unknown outcomes; `PAID` grace window handling |
| B8.6 | User cancel before `SENT` → `POST /transfers/{id}/cancel` |
| B8.7 | *(Stretch, `SPEND_SYNC`)* create the Spend bill on arming and mark it paid on `PAID` |

## B9 — Integration & demo mode · ~2 days (paired with U7)

| ID | Task |
| --- | --- |
| B9.1 | Contract conformance: every route returns zod-validated payloads identical to the mock `DataSource` |
| B9.2 | Demo endpoints ([08 §1](../08-demo-plan.md#1-demo-mode-building-blocks)): clock, market, scenario, transfer advance (via the simulation API), reset |
| B9.3 | Scenario scripts: `target-hit` (= Simulate on demo bill 1), `stay-watching`, `deadline-pay`, `insufficient-balance` |
| B9.6 | Simulate button backend ([08 §1.1](../08-demo-plan.md#11-simulate-button)): `/api/demo/bills/:id/simulate` + `/stop`, `RoutingRateSource`, the worker `demoSim` loop (scripted 1 s ticks into the normal execute path, transfer advance + immediate status read), the simulated-tick quote-check exception, `demo.sim` SSE events. Automated test uses the in-memory servers and `PAYMENTS_GATEWAY=mock`, and a second click while running returns `INVALID_STATE`. The sandbox timing check (`PAID` in < 40 s) waits for the Environment-table values. |
| B9.7 | Test-data generator ([11](../11-test-data-and-seeding.md)): `pnpm gen:invoices`, `pnpm seed:generate` (profiles `mixed`, `lifecycle`, `deadline`, `corridors`, `extraction`, `upload`, `stress`, `e2e`), pooled beneficiaries, states reached through services, funding check, `seed:reset --generated`, `POST /api/demo/generate`, "Add sample invoices" in the upload modal, `/dev/market` Test data panel. Test: the same seed run twice creates nothing new; `lifecycle` shows every state with real sandbox IDs |
| B9.4 | `pnpm seed:demo`: 3 invoice PDFs → bills (runs real extraction or uses a cached extraction for determinism) |
| B9.5 | End-to-end run with the UI on `api`. The default run is `PAYMENTS_GATEWAY=mock` on the in-memory servers. A sandbox run waits for the Environment-table values. Fix contract drift either way. |

## B10 — Hardening & demo readiness · ~1.5 days

| ID | Task |
| --- | --- |
| B10.1 | Idempotency/race tests: double-execute, a quote expiring before create, webhook before the create response, worker restart mid-execution |
| B10.2 | Observability: `/api/health` (Mongo, Redis, worker heartbeat, Airwallex token, feed freshness), queue depths and failed jobs per queue, a minimal ops page in `/dev/market` |
| B10.3 | Rate-limit soak (V10) at the target bill count; tune the poll interval. Ask before calling the sandbox (Environment table). |
| B10.4 | Security pass: scoped key, secrets never in the client bundle, `/dev` and `/api/demo` disabled when not in demo |
| B10.5 | Rehearsal checklist from [08 §4](../08-demo-plan.md#4-rehearsal-checklist); fallback to the mock gateway verified |

---

## Test strategy

| Layer | Tool | Scope |
| --- | --- | --- |
| Domain unit | Vitest (+ fast-check) | rate math, state machine, deadline/tz, trigger |
| Service | Vitest + `mongodb-memory-server` (replica-set mode) + `redis-memory-server` | transitions under concurrency, partial unique indexes, BullMQ jobs, sweeper, webhook processing. The test process starts and stops both. No Docker, and no MongoDB or Redis the user installed. |
| Adapter contract | Vitest, `AIRWALLEX_E2E=1` | real sandbox calls ([04 §5](../04-airwallex-integration.md#5-contract-tests)) |
| E2E | Playwright | demo scenarios on mocks (CI) and on sandbox (manual/nightly) |
