# 01 — Feasibility Review (Airwallex)

**Reviewed:** 2026-09-30 against the public Airwallex docs and API reference (latest API version at review time: `2026-08-21`).
**Verdict:** ✅ **Feasible.** Every money-moving step maps to a documented Airwallex API. Airwallex does **not** provide rate monitoring, target orders, alerts, historical rates or bill OCR over the API, so those are **our** responsibility. None of these gaps block the demo.

---

## 1. Requirement → capability map

| # | Requirement | Airwallex capability | Endpoint(s) | Status |
| --- | --- | --- | --- | --- |
| R1 | Enter a foreign-currency bill | Beneficiaries (payee bank details). Optional Spend Bills/Vendors (Beta). | `POST /api/v1/beneficiaries/create`, `GET /api/v1/beneficiaries/...`, `POST /api/v1/spend/bills/create` (Beta) | ✅ Native (beneficiary). Bill record lives in **our** DB. |
| R2 | Upload multiple bills (documents) | File Service for storage only. OCR exists in the Airwallex **web app** only. | `POST /api/v1/files/upload` (files subdomain, 20 MB max) | ⚠️ **We build extraction** (LLM/vision). Airwallex file upload is optional. |
| R3 | Set target FX rate or max cost | None. No conditional/limit FX orders in the API. | — | 🛠 **We build** (strategy engine). |
| R4 | Monitor the rate until the due date | Indicative current rate, 24/7, size- and date-aware | `GET /api/v1/fx/rates/current` | ✅ Native data, **we poll**. |
| R5 | Per-bill chart with history | No historical/time-series endpoint | — | 🛠 **We record ticks** + backfill from a third-party reference source (see §4.3). |
| R6 | Alert when the target is reached | None for rate thresholds. Webhooks cover conversions/transfers only. | — | 🛠 **We build** (in-app alerts). |
| R7 | Lock a price for the payment | Quotes: locked rate for 1 min–24 h, multi-use | `POST /api/v1/fx/quotes/create`, `GET /api/v1/fx/quotes/{id}` | ✅ Native. |
| R8 | Convert and pay | Transfer with an underlying conversion, optionally pinned to a quote | `POST /api/v1/transfers/create` (with `quote_id`) | ✅ Native, one call. |
| R8b | Convert only (hold in wallet) | Conversions | `POST /api/v1/fx/conversions/create` | ✅ Native, **but not for buy-only currencies** (see §3.2). |
| R9 | Final-day fallback at current rate | Transfer at market (no `quote_id`), or a fresh short quote | `POST /api/v1/transfers/create` | ✅ Native. |
| R10 | Guaranteed settlement by the deadline | Future-dated transfers up to ~90 days with conversion, unlocked rate option | `transfers/create` with `transfer_date`, `lock_rate_on_create=false`; `POST /api/v1/transfers/{id}/cancel` | ✅ Native. Optional "Airwallex-side safety net" (see §5). |
| R11 | Track payment status | Transfer + conversion webhooks, retrieve endpoints | `payout.transfer.*`, `conversion.*`, `GET /api/v1/transfers/{id}` | ✅ Native. |
| R12 | Check funds before paying | Wallet balances | `GET /api/v1/balances/current` | ✅ Native. |
| R13 | Demo the lifecycle end to end | Sandbox, plus a transfer status simulation API | `POST /api/v1/simulation/transfers/{id}/transition` | ✅ Native. |
| R14 | Mark the bill as paid in AP (stretch) | Spend Bills (Beta) mark-as-paid | `POST /api/v1/spend/bills/{id}/mark_as_paid` | ⚠️ Beta, needs org-level scopes. Stretch only. |

Legend: ✅ native · ⚠️ partial or beta · 🛠 we build it

---

## 2. What Airwallex gives us (verified facts)

### 2.1 Rates (indicative)

- `GET /api/v1/fx/rates/current?buy_currency=EUR&sell_currency=USD&buy_amount=250000[&conversion_date=YYYY-MM-DD]`
- If no amount is given, it defaults to **10,000**. The amount is validated against the conversion upper limit, and pricing depends on size and settlement date, so we **always pass the bill amount**.
- Pricing is available **24 hours a day, 365 days a year**.
- The response includes `rate`, `currency_pair`, `dealt_currency`, and `rate_details[]` per level (`CLIENT`, `AWX`, `PLATFORM_CLIENT`), each with `buy_amount`/`sell_amount`.
- Errors include `amount_above_limit`, `invalid_settlement_date`, `unsupported_currency`, and `invalid_argument`.

### 2.2 Quotes (binding)

- `POST /api/v1/fx/quotes/create` with `buy_currency`, `sell_currency`, one of `buy_amount`/`sell_amount`, `validity` ∈ `MIN_1 | MIN_15 | MIN_30 | HR_1 | HR_4 | HR_8 | HR_24`, and optionally `conversion_date`.
- It returns `quote_id`, `client_rate`, `awx_rate`, `mid_rate`, `valid_from_at`, `valid_to_at`, and `usage` (the API reference lists both `SINGLE_USE` and `MULTI_USE`; we store it and never reuse a quote either way).
- The quote **price depends on the validity period**. Longer validity means a wider price, so we pick the shortest validity that still covers the job that creates the transfer (`MIN_1`).
- A quote must be consumed before `valid_to_at`. The currencies (and any future `conversion_date`) in the consuming request must match.
- **Quotes cannot be used with Airwallex's own "submit for approval" transfers.** That workflow stays off (D-23). We call `transfers/create` with the quote.

### 2.3 Conversions

- `POST /api/v1/fx/conversions/create`. `request_id` (idempotency key) is required, plus exactly one of `buy_amount`/`sell_amount`, and optionally `quote_id` and `conversion_date`. The API reference says 64 characters. Sandbox V15 accepted 47 and rejected 54 or longer (field code 018), so our builders cap at 47.
- Minimum USD 1 per conversion. The sandbox default maximum is USD 5,000,000 per trade (configurable).
- Statuses: `SCHEDULED`, `OVERDUE`, `CANCELLED`, `SETTLED`. Webhooks: `conversion.scheduled | .overdue | .settled | .cancelled`.
- Booked-but-unsettled conversions can be cancelled through `POST /api/v1/conversion_amendments/create` (`type: CANCEL`). A cancellation delta fee usually applies.
- ⚠️ The how-to guide shows `/api/v1/conversions/create`, but the API reference uses **`/api/v1/fx/conversions/create`**. We use the API reference path (checklist item V3).

### 2.4 Transfers (payouts) — our primary execution primitive

- `POST /api/v1/transfers/create` with `beneficiary_id` (or an inline `beneficiary`), `transfer_currency` (F), `transfer_amount` (A), `source_currency` (H), `transfer_method` (`LOCAL`/`SWIFT`), `reason` (we use `bill_payment`), `reference`, and `request_id`.
- If `source_currency ≠ transfer_currency`, **Airwallex books the conversion automatically**. With `quote_id`, the conversion uses the quote's `client_rate`.
- `transfer_date`: omit it to dispatch ASAP. Setting it (even to today) routes through scheduled-transfer logic. The create-a-transfer guide allows future-dated transfers up to **180 days**; the error-code reference says 120 days for same-currency transfers and "check with your account manager" when a conversion is involved. Plan for ~**90 days** with a conversion until V6/V7 confirm it.
- `lock_rate_on_create` (default `true` for future-dated transfers with a conversion). `true` locks the rate now and holds a **prepayment**. `false` leaves the rate unconfirmed until the transfer date.
- Fees: `fee_amount`, `fee_currency`, `amount_payer_pays`, `amount_beneficiary_receives`, `fee_paid_by` (`PAYER` default), and `swift_charge_option` (`SHARED` default).
- Statuses and webhooks: `SCHEDULED → PROCESSING → SENT → PAID`, plus `OVERDUE`, `FAILED`, and `CANCELLED` (`payout.transfer.*`). **`PAID` is not final.** A transfer can still move to `FAILED` afterwards.
- Cancel with `POST /api/v1/transfers/{id}/cancel` (allowed before `SENT`; FX delta fees may apply).
- Validate without creating: `POST /api/v1/transfers/validate`.
- Listing requires a date range of **30 days or less**.

### 2.5 Funding & timing

- Accounts are **pre-funded by default**: the wallet must hold enough H before a conversion or transfer. Post-funding needs to be set up by an account manager.
- Future-dated transfers are deducted at **09:00 account time zone** on `transfer_date`, retried every 30 minutes until midnight, and then **auto-cancelled the following day** if still unfunded.
- The account time zone depends on the onboarding entity (e.g. AU → `Australia/Melbourne`, UK → `Europe/London`, US → `America/Los_Angeles`).

### 2.6 Platform

- Auth: `POST /api/v1/authentication/login` with `x-client-id` and `x-api-key` returns a bearer token valid for **30 minutes**. This endpoint is limited to **100 req/min per key**, so the token must be cached.
- Scoped API keys are recommended. Use `x-login-as` when a key spans multiple accounts.
- Versioning: date-based, pinned with the `x-api-version` header (latest is `2026-08-21`). Note: some endpoint groups have historically been versioned independently, so we centralise the version header per endpoint group in the client.
- Rate limits: **Sandbox** allows 20 req/s global, 10 req/s per endpoint, and 10 concurrent requests. **Production** allows 100 req/s, 20 req/s, and 50 concurrent. HTTP `429` means back off exponentially with jitter.
- Money fields are **decimal major units, not minor units**. Round to each currency's payout precision: 0 dp for CLP, ISK, JPY, KES, KRW, PYG, RWF, SAR, VND, XAF, XOF (KES and SAR differ from ISO); 3 dp for BHD, JOD, KWD, OMR, TND. Responses carry amounts as JSON numbers, so they need lossless parsing. Field-level details are in [13](./13-airwallex-contracts.md).
- Webhooks: HMAC-SHA256 over `x-timestamp + raw_body` → compare with `x-signature`. Responses other than 200 are retried for about 3 days with exponential backoff. Deliveries can be **duplicated and arrive out of order**, so dedupe on `id` and order by `created_at`. Endpoints need HTTPS and must accept traffic from Airwallex's IP allowlist.
- Sandbox: wallets are pre-credited in each currency. FX pricing is **simulated**, all pairs are enabled by default, and trade dates range from T+0 to T+3. Simulation APIs exist for transfers and deposits.
- Developer tooling: the Airwallex **Developer MCP** (`https://mcp.sandbox.airwallex.com/developer`, OAuth) and **Docs MCP** (`https://mcp.sandbox.airwallex.com/docs`) can be added to Cursor for docs lookup and sandbox actions while building.

---

## 3. Constraints that shape the design

### 3.1 No conditional orders → we own the "limit order"

Airwallex executes at **current** prices only. The target logic (polling, detection, alerting, quoting and paying) runs in our worker. The trigger fires on **indicative** rates, and every payment is backed by a **binding quote** that we check against the target again before creating the transfer (see [03 §3](./03-domain-model.md#3-trigger-rules)).

### 3.2 Buy-only currencies → execute through a single transfer, not conversion then payout

Many bill currencies are **buy-only**, and "Pure Conversion (hold in wallet)" is **not supported** for them (for example INR, PHP, PKR, IDR, TRY, most of Africa and LatAm). Their "Convert + Payout" column is ✅.

**Decision:** the default execution path is **one `transfers/create` call with `source_currency = H` and a `quote_id`**. That covers every supported payout currency. The "convert now, pay later" path through `fx/conversions` is only offered for pure-convertible currencies (see [09 D-04](./09-decisions-and-open-questions.md)).

### 3.3 No historical rates → chart data strategy

The chart combines three layers:

1. **Backfill** (context only): about 90 days of ECB daily fixings, fetched from Frankfurter and, when that call fails, from the ECB data API. Both are cached in `reference_rates`. The series is labelled "reference mid", not executable. The Airwallex rate is appended as the current point. While both hosts are down the chart stays loading and does not draw a line that starts at the first tick of this session.
2. **Live ticks**: our own polling of `fx/rates/current` (CLIENT level, bill-sized), stored in `rate_ticks`. This is what the entry and target lines compare against.
3. **Demo mode**: a seeded market simulator replaces layer 2 so movement is visible within minutes (see [08](./08-demo-plan.md)).

Exotic pairs without third-party coverage show only our own ticks from the arming time onwards.

### 3.4 Rate-limit budget for monitoring

Sandbox allows 10 req/s on `fx/rates/current`. Polling each active bill every 10 s gives about 0.1 req/s per bill, so **~50 bills fit comfortably** with headroom for quotes and transfers. The poller uses a token-bucket limiter shared across the worker. If needed, requests are coalesced by `(F, H, amount bucket)`.

B10.3 leaves `POLL_INTERVAL_MS` at 10 seconds. Fifty watching bills is 5 requests/s, under the worker's endpoint bucket of 8 and under the V10 result (about 8/s, all 200). A fresh sandbox soak waits for approval before anyone calls Airwallex again.

### 3.5 Quote validity

The quote is locked in the same job that creates the transfer, so the default validity is `MIN_1` (the shortest Airwallex offers). If the quote expires before that transfer is created, the bill stays **WATCHING** and the worker retries. Longer validity means a wider price; the settings form still lists the other Airwallex validities.

### 3.6 Payout lead time → execution deadline ≠ due date

`LOCAL` transfers typically arrive same-day to 1–2 business days; `SWIFT` takes roughly 1–5 business days (corridor-dependent). The **execution deadline** is `due_date − lead_business_days(method, corridor)` in the account time zone, with weekends skipped. The chart shows both lines. Holidays are not modelled in the demo; this is a known limitation.

### 3.7 Pre-funding

Before creating a transfer, we call `GET /api/v1/balances/current`. If H is insufficient, the bill stays **WATCHING**, `BalancePill` turns red, and a banner names the shortfall. The worker retries until the cutoff. In sandbox, wallets are pre-credited, and deposits can be simulated for the demo.

### 3.8 Rate orientation

`currency_pair`/`client_rate` orientation depends on the pair (e.g. `AUDUSD`). To avoid orientation bugs, **we derive our canonical price from amounts**: `price(H per F) = sell_amount / buy_amount` on the `CLIENT` level of `rate_details`, requested with `buy_currency=F`, `buy_amount=A`, `sell_currency=H`. See [03 §2](./03-domain-model.md#2-rate-math).

---

## 4. Build vs buy summary

| Capability | Owner | Notes |
| --- | --- | --- |
| Bill extraction from PDF/image | **Us** | Deterministic readers (e-invoice XML, payment QR) + Claude structured output + validators + human review ([12](./12-bill-extraction.md)). Airwallex OCR is web-app only. |
| Vendor bank details → beneficiary | Airwallex | Use the beneficiary API schema endpoints to validate fields per corridor. |
| Target/max-cost strategy | **Us** | Strategy engine + state machine. |
| Rate polling + tick store | **Us** (data from Airwallex) | `fx/rates/current`. |
| Historical context | Third party | Frankfurter/ECB by default; swappable `HistorySource`. |
| Alerting | **Us** | In-app (SSE + toasts + notification centre). No out-of-band channel in the demo (Q-05). |
| Locked price for the payment | Airwallex | Quotes. |
| Payment authorization | **Us** | The standing instruction captured at submit (D-23). We do not use Airwallex transfer approvals, since they are incompatible with quotes. |
| Conversion + payout | Airwallex | Transfers with `quote_id`. |
| Deadline scheduler | **Us** | Timers stored in MongoDB, a sweeper that enqueues BullMQ jobs, and an optional Airwallex-side scheduled transfer as a safety net. |
| Status tracking | Airwallex → us | Webhooks + reconciliation polling. |

---

## 5. Deadline guarantee: two layers

**Layer A (default, in-app):** at the cutoff (default 14:00 account time) on the execution-deadline day, if the bill is still `WATCHING` or `PAUSED`, the worker locks a `MIN_1` quote and pays at market under the standing instruction.

**Layer B (optional, "belt and braces"):** at arming, we also create an Airwallex **future-dated transfer** for the execution-deadline date with `lock_rate_on_create=false`. The rate is unconfirmed and no prepayment is held; funds are deducted at 09:00 on that date. If the target path executes first, we **cancel** the scheduled transfer. This guarantees payment even if our worker is down.

Trade-offs of Layer B:
- The cancellation fee behaviour for an unlocked scheduled transfer needs confirmation (docs say an "FX cancellation delta fee may apply" for `SCHEDULED`). See checklist item V6.
- It is limited to about 90 days ahead with a conversion.
- It executes at 09:00. The standing instruction captured at arming covers that payment.

**Demo default:** Layer A only, with Layer B behind a feature flag (`DEADLINE_SAFETY_NET=airwallex`).

---

## 6. Risks & mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Sandbox rates are simulated and may barely move | The chart looks dead in the demo | Demo-mode market simulator (seeded GBM + scripted moves). Real sandbox calls are still made for quotes and transfers. |
| Quote price differs from the indicative rate that triggered | False "target hit" | Re-check the quote against the target. If it misses, log a **near miss** and keep watching. Optional trigger buffer (bps). |
| The locked quote expires before the transfer is created | Payment delayed | Stay watching and retry. The cutoff still pays. |
| Worker downtime | Missed deadline | Idempotent jobs with catch-up on boot, plus optional Layer B safety net. |
| Duplicate execution | Double payment | `request_id` = deterministic `bill_id:attempt` idempotency key. State changes are atomic conditional updates with a `version` check. A partial unique index allows only one active execution per bill, and the BullMQ `jobId` is deterministic. |
| Webhook duplicates / reordering | Wrong status shown | Dedupe on event `id`. Monotonic status-rank guard. Periodic reconciliation with `GET /transfers/{id}`. |
| `PAID` then `FAILED` | False "paid" state | Keep listening. The UI shows "Paid (settling)" until the grace window passes. |
| Insufficient wallet balance | Transfer fails or auto-cancels | Balance pre-check before the transfer is created, including at the cutoff. The bill stays watching and the UI shows a warning. |
| API version drift between endpoint groups | `incorrect_version` errors | Per-endpoint-group version config in the client, plus a contract test suite against sandbox. |
| Extraction errors on bills | Wrong amount or payee | Mandatory human review. Show a per-field confidence score. Validate the beneficiary against the Airwallex schema. |
| Exotic pair not covered by the history source | Empty chart backfill | Show our own ticks only, with an explicit "No reference history" chip. |

---

## 7. Verification checklist (run in sandbox during B1/B2)

| ID | Check | Why |
| --- | --- | --- |
| V1 | Auth + token reuse, `x-api-version: 2026-08-21` accepted by the rates, quotes, transfers and beneficiaries endpoints | Version drift across groups |
| V2 | `fx/rates/current` with `buy_amount` = bill amount returns a CLIENT `rate_details` entry; derive `sell_amount/buy_amount` | Canonical price derivation |
| V3 | ~~`POST /api/v1/fx/conversions/create` vs `/api/v1/conversions/create`~~ **Resolved from the API reference:** `/api/v1/fx/conversions/create` (retrieve: `/api/v1/fx/conversions/{conversion_id}`). The smoke still calls it once. | Path discrepancy in docs |
| V4 | Quote `MIN_1` → `transfers/create` with `quote_id` (no `transfer_date`) succeeds; returned `conversion.rate` matches the quote | Primary execution path |
| V5 | Quote consumed after `valid_to_at` → expect `quote_expired` on `transfers/create` (`expired_quote` is the conversions spelling) | Expiry handling |
| V6 | Future-dated transfer with `lock_rate_on_create=false` → cancel → confirm fee/charges | Layer B safety net cost |
| V7 | Can a `quote_id` be combined with a future `transfer_date`? | Enables "lock now, pay on due date" |
| V8 | Simulation: transition `SCHEDULED → PROCESSING → SENT → PAID`; webhooks received and signature verified | Demo lifecycle |
| V9 | Buy-only currency (e.g. INR) transfer from USD with a quote works in sandbox | §3.2 decision |
| V10 | Rate-limit behaviour at ~8 req/s sustained on `fx/rates/current` | Poller budget |
| V11 | (Stretch) Spend Bills API enabled on the sandbox org with scoped key | AP sync stretch |
| V12 | Which generated bank details the sandbox accepts per corridor (IBAN checksum only, or real bank codes? UK modulus check? IFSC directory?), and which values make a beneficiary or transfer fail | Test-data generator allowlist ([11](./11-test-data-and-seeding.md)) |
| V13 | Sandbox deposit simulation (`POST /simulation/deposit/create`, needs a **Global Account** `global_account_id` in H) can top up the home-currency wallet by API | Generator funding step, insufficient-balance scenario |
| V14 | KES/SAR precision: does `transfers/validate` accept `100.50 KES` (ISO 2 dp) or only `100` (Payouts table 0 dp)? | `currencies.ts` precision ([13 §1.1](./13-airwallex-contracts.md#11-currency-precision)) |
| V15 | Simulated `FAILED` with each `failure_type` → record the resulting `failure { code, message, details }`; confirm the automatic `CANCELLED` that follows | Failure category mapping ([13 §4.5](./13-airwallex-contracts.md#45-failure-categories)) |
| V16 | `beneficiaries/verify_account` in sandbox for EUR (SEPA) and GBP (UK): which results come back, including for generator bank details | `BeneficiaryCard` verification badges ([13 §5.4](./13-airwallex-contracts.md#54-bank-search-validate-verify)) |
| V17 | SWIFT transfer with `swift_charge_option: PAYER` vs `SHARED`: does `fee_amount` / `amount_payer_pays` change, and is it known at create time? | D-18 cost display |

Sandbox run on 2026-10-04. The full table is [verification-results.md](./verification-results.md). The gate (V1, V2, V4, V5, V8, V9) passed.

- V4 locked a `MIN_1` quote and created a EUR transfer whose conversion rate matched. V5 returned `quote_expired` after `valid_to_at`. V9 did the same for INR.
- V3 `POST /fx/conversions/create` accepted a conversion. The product path stays the single transfer in D-03.
- V6 created a future-dated transfer with `lock_rate_on_create=false`, fee 0, and cancel succeeded. V7 accepted `quote_id` together with `transfer_date`. D-04 stays out of scope.
- V8 reached `PAID` through `PROCESSING → SENT → PAID`. Webhook delivery was not checked: no webhook secret and no tunnel.
- V10 sent 24 rate calls at about 8/s and got 200 for all of them.
- V12 accepted EUR, GBP, JPY, SGD, and INR beneficiaries. The bank ids are on the corridors in `src/mocks/generators/corridors.ts`. V13 is blocked until `AIRWALLEX_GLOBAL_ACCOUNT_ID` is set.
- V14: `transfers/validate` rejected `100.50` KES (field code 042, too many decimals) and accepted `100`. A body without `request_id` was rejected first (field code 001).
- V15: `POST /simulation/transfers/{id}/transition` with `next_status: FAILED` returned 500 `operation_failed`, including after a `PROCESSING` step. The failure object was not returned. Three creates were rejected because the `request_id` was 54 characters or longer (field code 018); 47-character ids were accepted. Bill ids in this app stay shorter than that.
- V16: EUR `verify_account` returned `VERIFIED`. GBP, on a real Barclays sort code with a fictional account number, returned `INVALID`.
- V17: on a 20 EUR SWIFT transfer, `PAYER` was fee 25 / payer pays 47.66 and `SHARED` was fee 15 / payer pays 37.66, both known at create.
- `GET /account` returned a US business whose registration address is Los Angeles, CA, and no timezone field.

---

## 8. Sources

- Transactional FX: [Create a conversion](https://www.airwallex.com/docs/transactional-fx/get-started/create-a-conversion), [Choose your FX solution](https://www.airwallex.com/docs/transactional-fx/get-started/choose-your-fx-solution), [Funding & settlement models](https://www.airwallex.com/docs/transactional-fx/funding-and-settlement-models), [Supported currencies](https://www.airwallex.com/docs/transactional-fx/supported-regions-and-currencies), [Conversion amendments](https://www.airwallex.com/docs/transactional-fx/amendments/conversion-amendments), [Integration checklist](https://www.airwallex.com/docs/transactional-fx/test-and-go-live/integration-checklist)
- API reference: [Rates](https://www.airwallex.com/docs/api/transactional_fx/rates/api), [Quotes](https://www.airwallex.com/docs/api/transactional_fx/quotes/create), [Conversions](https://www.airwallex.com/docs/api/transactional_fx/conversion), [Transfers](https://www.airwallex.com/docs/api/payouts/transfers/api), [Simulation: transfers](https://www.airwallex.com/docs/api/simulation/transfers), [File service](https://www.airwallex.com/docs/api/supporting_services/file_service), [Spend bills](https://www.airwallex.com/docs/api/spend/bills), [Versioning](https://www.airwallex.com/docs/api/versioning)
- Payouts: [Create a transfer](https://www.airwallex.com/docs/payouts/transfers/create-a-transfer), [Transfer statuses](https://www.airwallex.com/docs/payouts/transfers/create-a-transfer/transfer-statuses), [Handle failed transfers](https://www.airwallex.com/docs/payouts/transfers/manage-transfers/handle-failed-transfers), [Create beneficiaries](https://www.airwallex.com/docs/payouts/beneficiaries/create-beneficiaries), [Currency precision](https://www.airwallex.com/docs/payouts/how-airwallex-payouts-work/currency-precision)
- Spend: [Bills via API](https://www.airwallex.com/docs/spend/accounts-payable/bills-via-api), [Vendors via API](https://www.airwallex.com/docs/spend/accounts-payable/vendors-via-api), [Spend webhooks](https://www.airwallex.com/docs/spend/get-started/set-up-spend-webhooks)
- Developer tools: [Manage API keys](https://www.airwallex.com/docs/developer-tools/api/manage-api-keys), [Rate limits](https://www.airwallex.com/docs/developer-tools/api/rate-limits), [Webhooks overview](https://www.airwallex.com/docs/developer-tools/webhooks/webhooks-overview), [Listen for webhook events](https://www.airwallex.com/docs/developer-tools/webhooks/listen-for-webhook-events), [Transfer webhook events](https://www.airwallex.com/docs/developer-tools/webhooks/listen-for-webhook-events/transfers), [Conversion webhook events](https://www.airwallex.com/docs/developer-tools/webhooks/listen-for-webhook-events/event-types/conversions), [Sandbox overview](https://www.airwallex.com/docs/developer-tools/sandbox-environment), [Sandbox settings](https://www.airwallex.com/docs/developer-tools/sandbox-environment/sandbox-settings), [Developer connectors (MCP)](https://www.airwallex.com/docs/developer-tools/ai/developer-connector), [AI agent integration best practices](https://www.airwallex.com/docs/developer-tools/ai-agent-instructions)
