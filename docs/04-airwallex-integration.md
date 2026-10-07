# 04 — Airwallex Integration Spec

This doc describes every Airwallex call we make, why we make it, and exactly how. The field-level mapping of responses, enums and error codes to our contracts and UI is in [13 Airwallex → Contracts & UI](./13-airwallex-contracts.md). Base URLs:

| Env | API | Files |
| --- | --- | --- |
| Sandbox | `https://api.sandbox.airwallex.com/api/v1` | `https://files.sandbox.airwallex.com/api/v1` *(verify; docs show `files-demo`/`files` subdomains)* |
| Production | `https://api.airwallex.com/api/v1` | `https://files.airwallex.com/api/v1` |

All requests except login carry `Authorization: Bearer <token>`, `Content-Type: application/json`, and `x-api-version: ${AIRWALLEX_API_VERSION}`.

---

## 1. Client design (`src/server/adapters/airwallex/`)

```
airwallex/
├─ client.ts          # fetch wrapper: base URL, headers, version, retries, 429 backoff, logging
├─ auth.ts            # token cache (single-flight), refresh 60 s before expires_at
├─ limiter.ts         # token bucket: global 15 rps, per-endpoint 8 rps (sandbox-safe)
├─ errors.ts          # AirwallexError { status, code, message, source, details, fieldErrors }; code aliases (13 §2)
├─ endpoints/
│  ├─ rates.ts        # getCurrentRate
│  ├─ quotes.ts       # createQuote, getQuote
│  ├─ conversions.ts  # createConversion, getConversion (only for convert-and-hold path)
│  ├─ transfers.ts    # createTransfer, validateTransfer, getTransfer, listTransfers, cancelTransfer
│  ├─ beneficiaries.ts# create, get, list, validate, verifyAccount, getApiSchema, getFormSchema, searchBanks
│  ├─ balances.ts     # getCurrentBalances, getBalanceHistory
│  ├─ reference.ts    # supportedCurrencies, invalidConversionDates, quota (cached 24 h)
│  ├─ files.ts        # uploadFile (optional)
│  ├─ spend.ts        # createBill, markBillPaid (stretch, Beta)
│  └─ simulation.ts   # transitionTransfer (sandbox only; throws in production)
├─ webhooks.ts        # verifySignature(rawBody, headers), parseEvent
└─ mappers.ts         # Airwallex payloads → contracts (price derivation lives here)
```

**Rules**
- **Auth:** `POST /authentication/login` with `x-client-id`, `x-api-key` (+ optional `x-login-as`). One `AirwallexClient` per process (`getAirwallexClient`) caches the token and refreshes when `now > expires_at − 60 s`. Callers share that client, so they share one login and one rate limiter. Token expiry and the limiter use the wall clock, not the warp clock. Never log keys or tokens.
- **Retries:** retry `429` and `5xx` with exponential backoff and jitter (1 s, 2 s, 4 s, 8 s, max 16 s, 5 attempts). **Never retry a `POST` create unless it carries the same `request_id`.** Airwallex dedupes on it.
- **Idempotency keys (`request_id`, max 64 chars):**
  - Transfer: `tr:{billId}:{attemptNo}`
  - Conversion: `cv:{billId}:{attemptNo}`
  - Beneficiary: `bf:{billId}` (if supported on that endpoint; otherwise dedupe on our side)
  - `attemptNo` only increments after a **terminal** failure, never on a network retry.
- **Money:** send amounts as **decimal strings in major units**, rounded to the payout precision (KES/SAR are 0 dp on Airwallex, unlike ISO). Responses return amounts as JSON **numbers**: parse bodies with a lossless JSON parser (numbers → strings), then `decimal.js`. See [13 §1](./13-airwallex-contracts.md#1-wire-conventions).
- **Rates:** `client_rate`, `mid_rate` and `conversion.rate` follow the `currency_pair` market convention. Never use them as `p`; derive `p = sell_amount / buy_amount` and orient reference rates with `orient()` (13 §1).
- **Logging:** log method, path, status, `trace_id` and latency. Log bodies with the bank fields redacted.

---

## 2. Endpoints

### 2.1 Current rate: drives the chart and triggers

`GET /fx/rates/current`

| Param | Value |
| --- | --- |
| `buy_currency` | F |
| `sell_currency` | H |
| `buy_amount` | A (bill amount) |
| `conversion_date` | omit (default, same day when funded) |

Mapping: `price = CLIENT.sell_amount / CLIENT.buy_amount`, stored as a `rate_tick` with source `AIRWALLEX`.

Errors: `amount_above_limit` (flag the bill: "Amount above FX limit, contact account manager"), `unsupported_currency` (block arming).

### 2.2 Quote: binding price for the payment

`POST /fx/quotes/create`

```json
{
  "buy_currency": "EUR",
  "buy_amount": "250000.00",
  "sell_currency": "USD",
  "validity": "MIN_1"
}
```

Store `quote_id`, `client_rate`, `awx_rate`, `mid_rate`, `buy_amount`, `sell_amount`, `valid_from_at`, `valid_to_at`, and the derived `price = sell_amount / buy_amount`.

| Purpose | Validity (default) |
| --- | --- |
| Target hit | `MIN_1` (consumed in the same job) |
| Deadline payment | `MIN_1` |
| Pay now | `MIN_1` |

### 2.3 Transfer with conversion: primary execution path

`POST /transfers/create`

```json
{
  "request_id": "tr:5b1c…:1",
  "beneficiary_id": "370d83d6-52e8-4bdd-97b6-56d18c5ba4d0",
  "transfer_currency": "EUR",
  "transfer_amount": "250000.00",
  "source_currency": "USD",
  "transfer_method": "LOCAL",
  "quote_id": "d9af1614-a6a1-4d45-aae7-6858fc6d9ede",
  "reason": "bill_payment",
  "reference": "INV-0001",
  "metadata": { "bill_id": "5b1c…", "app": "fx-target-payment" }
}
```

- Omit `transfer_date` to dispatch ASAP.
- `reason` and `reference` are **required**. `reason` is an enum (default `bill_payment`; the bill's `transferReason`); `reference` defaults to the invoice number. See [13 §4.1](./13-airwallex-contracts.md#41-request-fields-we-set-post-apiv1transferscreate).
- `fee_paid_by: PAYER` (default). For SWIFT, `swift_charge_option: PAYER` so the vendor receives the full amount (D-18, V17).
- `quote_id` must match `sell_currency = source_currency` and `buy_currency = transfer_currency`.
- The cutoff always locks a `MIN_1` quote first and sends `quote_id`. Some accounts return `quote_id_required` if it is omitted.
- Store `id`, `short_reference_id`, `status`, `funding.status`, `conversion.rate`, `source_amount`, `amount_payer_pays`, `amount_beneficiary_receives`, `fee_amount`, `fee_currency`, `fee_paid_by`, `dispatch_date`, `failure` and `updated_at`. Fee and amounts are **tentative until `SCHEDULED`**.

**Validation at arming:** `POST /transfers/validate` with the same body as create, without `quote_id`, runs when the user arms the bill. The sandbox rejected a body that omitted `request_id` (field code 001) on 2026-10-04, so the call sends one. `validation_failed` field errors, account/method limits and beneficiary problems show up in review, not at trigger time ([13 §4.4](./13-airwallex-contracts.md#44-validation-at-arming)).

**Pre-flight (executor):**
1. `GET /balances/current`: require `available_amount(H) ≥ quote.sell_amount + fee_est`. A short balance on a target hit or pay now returns the bill to `WATCHING` with `insufficientBalance`. A short balance at the cutoff keeps the bill `EXECUTING` and retries the same `request_id`.
2. `POST /transfers/validate` runs again on the Airwallex gateway before create. The mock gateway skips it.

**Error handling** (full table with UI treatment: [13 §2.1](./13-airwallex-contracts.md#21-error-codes--our-codes--ui)):
| Error | Action |
| --- | --- |
| `quote_expired` (on `transfers/create`; `expired_quote` on conversions) | Stay `WATCHING` and retry. |
| `quote_id_invalid` (`invalid_quote_id` on conversions) | Re-quote once; if it fails again, `FAILED`. |
| `duplicate_request_id` / `request_id_duplicate` (legacy) | Not a failure: `details.id` is the existing transfer. `GET /transfers/{id}` and continue. |
| `409 request_pending` | The same `request_id` is still being processed. Back off, then retry with the same `request_id`. |
| `balance_insufficient` | `INSUFFICIENT_BALANCE` (as pre-flight step 1). |
| `validation_failed`, `*_limit`, `*_unsupported` | `FAILED` with `fieldErrors`/`params`. The user fixes the bill and re-arms. |
| `429` / `5xx` / `service_unavailable` / timeout | Retry with the **same** `request_id`. After max attempts, keep it `EXECUTING` and let the reconciler query `GET /transfers?request_id=…` to discover the outcome. |

### 2.4 Transfer lifecycle

| Airwallex status | Our state | UI |
| --- | --- | --- |
| `SCHEDULED` | `IN_FLIGHT` | "Scheduled" |
| `OVERDUE` | `IN_FLIGHT` + flag | "Overdue — funding" (red chip) |
| `PROCESSING` | `IN_FLIGHT` | "Processing" |
| `SENT` | `IN_FLIGHT` | "Sent" |
| `PAID` | `PAID` (grace: keep listening for `failed` for 72 h) | "Paid" |
| `FAILED` | `FAILED` | "Failed · {category}" ([13 §4.5](./13-airwallex-contracts.md#45-failure-categories)) |
| `CANCELLED` | `CANCELLED` if we requested it; `FAILED` ("Not funded") after `OVERDUE`; **ignored after `FAILED`** | |
| `IN_APPROVAL` / `APPROVAL_*` | `IN_FLIGHT` + `awxApproval` flag | "Awaiting Airwallex approval". It should never happen: the runbook disables that workflow because those transfers cannot use quotes (D-23). |

Status rank for monotonic updates: `SCHEDULED(1) = OVERDUE(1) < PROCESSING(2) < SENT(3) < PAID(4)`. `FAILED` overrides anything, including `PAID` (late failure after `PAID` is documented). Airwallex **auto-cancels a failed transfer within seconds**, so a `CANCELLED` after `FAILED` must not replace `FAILED`. `CANCELLED` only applies from a non-terminal status. `funding.status` is stored alongside and shown when not `FUNDED`.

`GET /transfers/{id}` is used by the reconciler every 60 s for executions not in a terminal state, and on boot.

`POST /transfers/{id}/cancel` is used for user cancellation (before `SENT`) and by the Layer B safety net.

Layer B (`DEADLINE_SAFETY_NET=airwallex`) creates that scheduled transfer at arming: the same `POST /transfers/create` body, plus `transfer_date` (the execution deadline) and `lock_rate_on_create: false`, and no `quote_id`. Its `request_id` is `sn:{billId}`, so it never collides with `tr:{billId}:{attempt}`. A duplicate `request_id` loads the existing transfer. The cutoff, a target hit, and pay now cancel it before they enqueue execution.

### 2.5 Convert-and-hold (optional path)

`POST /fx/conversions/create` with `request_id`, `buy_currency`, `buy_amount`, `sell_currency`, `quote_id`. This is only offered for currencies marked **Pure Conversion ✔** (e.g. EUR, GBP, JPY, SGD, AUD). Pay later with a same-currency transfer (`source_currency = transfer_currency = F`) on or before the execution deadline. Webhooks: `conversion.*`. See [09 D-04](./09-decisions-and-open-questions.md).

### 2.6 Beneficiaries

- `POST /beneficiaries/create` with `beneficiary{ entity_type, company_name, address, bank_details{…}, type: BANK_ACCOUNT }` and `transfer_methods: ["LOCAL"|"SWIFT"]`.
- The review form is rendered from `POST /beneficiary_form_schemas/generate` for `(bank_country_code, account_currency, transfer_method, entity_type)` by `SchemaForm`. `DYNAMIC_SELECT` bank fields search via `GET /beneficiary_form_schemas/supported_financial_institutions`. `TRANSFER_METHOD` options carry **limits and flight time**, which drive default lead days ([13 §5.2–5.3](./13-airwallex-contracts.md#52-dynamic-form--beneficiaryformschema--schemaform)). The seeder uses `POST /beneficiary_api_schemas/generate`.
- `POST /beneficiaries/validate` before create; field errors map onto the form by `source`.
- `POST /beneficiaries/verify_account` (LOCAL; SEPA, UK and Viet Nam only) gives `VERIFIED`/`INVALID`/… plus a name-match result. `INVALID` blocks arming; a partial or no match needs explicit confirmation ([13 §5.4](./13-airwallex-contracts.md#54-bank-search-validate-verify)).
- Store only `airwallex_beneficiary_id` + masked display fields.
- Demo: seed 3–5 sandbox beneficiaries (EUR/IBAN, GBP/sort code, JPY, SGD, INR) through a script: `pnpm seed:beneficiaries`.

### 2.7 Balances

`GET /balances/current` is cached for 30 s. It is shown in the top bar and used by the executor pre-flight (`available_amount`; `reserved_amount` already holds pending payouts).

### 2.7b Reference data

Cached for 24 h in Redis: `GET /reference/supported_currencies` (account-specific buy/sell lists that override the static capability table), `GET /reference/invalid_conversion_dates?currency_pair=` (FX holidays skipped by the deadline math), and `GET /reference/order_items/quota?type=ID_OUTBOUND|VN_OUTBOUND` (IDR/VND outbound quota warning). See [13 §6](./13-airwallex-contracts.md#6-balances-and-reference-data).

### 2.8 Files (optional)

`POST {files}/files/upload` (multipart, ≤ 20 MB, filename ≤ 50 chars) returns a `file_id`. Only needed for the Spend Bills stretch goal (attachments). We store documents ourselves in any case.

### 2.9 Spend Bills (stretch, Beta)

`POST /spend/bills/create` (needs `legal_entity_id` from `GET /account`, `vendor_id` from `POST /spend/vendors/create`, `billing_currency`, `due_date`, `line_items`, and `request_id`). After `PAID`, call `POST /spend/bills/{id}/mark_as_paid`. This requires organization-level scopes. Feature flag: `SPEND_SYNC=true`.

### 2.10 Simulation (sandbox only)

`POST /simulation/transfers/{id}/transition` with `{ "next_status": "PROCESSING" | "SENT" | "PAID" | "FAILED" | "CANCELLED" | "OVERDUE", "failure_type"?: "..." }`. Only valid next statuses are accepted. `PAID` requires API version ≥ `2024-04-30`. The demo control room calls this to advance a transfer on stage.

Deposits simulation (`POST /simulation/deposit/create` with `global_account_id`, `amount`) tops up the H wallet for the "insufficient balance → top up" demo beat. It needs a **Global Account in H** on the sandbox account (`AIRWALLEX_GLOBAL_ACCOUNT_ID`, V13).

`failure_type` values for `FAILED` transitions are grouped into UI categories in [13 §4.5](./13-airwallex-contracts.md#45-failure-categories).

---

## 3. Webhooks

**Endpoint:** `POST /api/webhooks/airwallex` (public HTTPS; in local development use a `cloudflared` or `ngrok` tunnel and register its URL in the sandbox web app under **Developer → Webhooks**, with the API version equal to `AIRWALLEX_API_VERSION`).

**Subscribe to:**
- `payout.transfer.scheduled`, `.overdue`, `.processing`, `.sent`, `.paid`, `.failed`, `.cancellation_requested`, `.cancelled`, `.in_approval` (config alert only)
- `payout.transfer.funding.processing`, `.funded`, `.failed`, `.cancelled`, `.reversed`
- `conversion.scheduled`, `.settled`, `.cancelled`, `.overdue` (convert-and-hold path)
- `deposit.settled`, `deposit.reversed` (refresh the balance cache). `deposit.pending` and `deposit.rejected` do not change the wallet.

**Handler algorithm:**
1. Read the **raw** body string. Do not parse it yet.
2. `expected = HMAC_SHA256(secret, x-timestamp + rawBody).hex()`. Constant-time compare with `x-signature`. Reject if `|now − x-timestamp| > 5 min`.
3. Parse, then `WebhookEvent.create({ _id: event.id, … })`. A duplicate-key error (`11000`) means the event was already received, so return `200`.
4. **Respond `200` immediately**, then process asynchronously by adding a BullMQ `webhook` job with `jobId: webhook.{eventId}`.
5. Processor: the resource is `data.object` when that value is an object, otherwise `data` itself. Current transfer webhooks put the transfer directly under `data`; it has the same shape as `GET /transfers/{id}` either way, so it goes through the **same mapper**. Find the execution by the transfer id or `metadata.bill_id`, then apply the status with the monotonic rank guard, write a `bill_event`, and publish to Redis `app_events`. A transfer `status` outside our enum is logged and ignored (the reconciler still polls). If `version` is present and ≠ `AIRWALLEX_API_VERSION`, log a warning. Some event families omit `version`, `created_at`, and send `accountId` instead of `account_id`.

Dashboard **test** events are signed with the secret in the `client-secret-key` header, not `AIRWALLEX_WEBHOOK_SECRET`. This route returns 400 for those on purpose.
6. Ordering: never rely on delivery order. Compare the object's `updated_at` with the stored value.

**Airwallex IP allowlist:** if we run behind a firewall, allow the sandbox and production webhook IPs listed on the "Listen for webhook events" page.

---

## 4. Sandbox setup runbook

1. Create a sandbox account (entity name **"Sandbox Business"** or **"New Business Sandbox"** for auto-approval of additional accounts).
2. Note the **account time zone** (from the onboarding entity) and set `AIRWALLEX_ACCOUNT_TZ`.
3. **Developer → API keys**: create a **scoped** key with FX (rates, quotes, conversions), transfers, beneficiaries, balances and files write access. Add spend/org scopes only if the stretch goal is taken.
4. Ask the account manager or support to confirm that **Quotes** are enabled for the sandbox account (FX product: Rates + Quotes), and the funding mode (pre-fund default, auto-funding; not manual `confirm_funding`).
   - Make sure **no Airwallex transfer-approval workflow** is active (otherwise transfers stop in `IN_APPROVAL`; those transfers cannot use quotes, D-23). Create or note a **Global Account in H** for deposit simulation and set `AIRWALLEX_GLOBAL_ACCOUNT_ID`.
5. **Developer → Webhooks**: register the tunnel URL, select the events in §3, and copy the secret into `AIRWALLEX_WEBHOOK_SECRET`.
6. Run `pnpm airwallex:smoke`, which executes the verification checklist from [01 §7](./01-feasibility-airwallex.md#7-verification-checklist-run-in-sandbox-during-b1b2), prints a pass/fail table, and **records every raw response** (redacted) to `src/server/adapters/airwallex/__fixtures__/` for the mapper tests.
7. Run `pnpm seed:beneficiaries` and `pnpm seed:demo`.
8. Optional: add the Airwallex **Developer MCP** to Cursor (`https://mcp.sandbox.airwallex.com/developer`) for docs lookup and sandbox actions while building.

---

## 5. Contract tests

`src/server/adapters/airwallex/__tests__/contract.sandbox.test.ts` is run manually and nightly with `AIRWALLEX_E2E=1`:

- login → token reuse across 5 calls (1 login)
- rate for EUR/USD at 250k → CLIENT level present → price > 0
- quote `MIN_1` → transfer with quote to a seeded EUR beneficiary → status `SCHEDULED|PROCESSING`
- simulation to `SENT` → `PAID`; the webhook arrives within 30 s (when a tunnel is present)
- expired quote on `transfers/create` → `quote_expired`
- same `request_id` twice → `duplicate_request_id` (or legacy `request_id_duplicate`) with `details.id`
- `transfers/validate` with an over-long `reference` → `validation_failed` with a field error on `reference`
- INR buy-only transfer with a quote from USD succeeds
- simulated `FAILED` with each `failure_type` in 13 §4.5 → record `failure` (V15); a following `CANCELLED` doesn't overwrite `FAILED`
- mapper round-trip on every recorded fixture: amounts survive lossless parsing exactly
