# 13 — Airwallex → Contracts & UI Reference

This is the field-level map from the Airwallex API to our contracts (`src/contracts`) and UI components. It answers three questions for every resource: **which Airwallex fields we read**, **what contract field they become**, and **which component renders them in which state**. [04](./04-airwallex-integration.md) describes *how* we call Airwallex; this doc describes *what comes back* and *what the UI does with it*.

- **Read by:** C0.1–C0.3 (contracts + fixtures), U3/U5 (components whose variants come from Airwallex enums), B1.4–B1.5 (endpoints + mappers), B4.5 (beneficiaries), B8 (execution, webhooks).
- **Source:** the Airwallex API reference and guides as of 2026-10-01, API version `2026-08-21`. Every page is available as markdown: API reference at `https://www.airwallex.com/docs/api/<product>/<resource>/<action>.md` (e.g. [`transactional_fx/rates/current.md`](https://www.airwallex.com/docs/api/transactional_fx/rates/current.md)), guides at `https://www.airwallex.com/docs/<path>.md` (index: [`/docs/llms.txt`](https://www.airwallex.com/docs/llms.txt)). §10 lists every page used.
- **Docs examples are not fixtures.** Several reference examples are internally inconsistent (the rates example has `"rate": 7632` next to a CLIENT rate of `0.781523`). Mapper tests use **recorded sandbox responses** captured by `pnpm airwallex:smoke` (B2.1), not the doc examples.

---

## 1. Wire conventions

| Topic | Airwallex behaviour | Our rule |
| --- | --- | --- |
| Amounts in responses | JSON **numbers** in major units (`"sell_amount": 12794.27`) | Parse response bodies with a lossless JSON parser (`lossless-json`, numbers → strings) in `client.ts`, then `decimal.js`. `JSON.parse` silently rounds beyond ~15 significant digits. |
| Amounts in requests | Transfers and conversions take **strings** (`"transfer_amount": "50"`); rates/quotes are documented as numbers | Always send the decimal string, already rounded to precision (§1.1). For number-typed params, serialise the string as a raw JSON numeric literal, never via `Number()`. |
| Timestamps | ISO 8601 with numeric offsets (`2017-03-22T16:08:02+1100`, `+0000`) | Parse in one helper (`parseAwxTimestamp`) and store UTC. Contracts carry ISO `Z` strings. |
| Dates | `YYYY-MM-DD` (`conversion_date`, `transfer_date`, `dispatch_date`) | Kept as date strings; interpreted in `AIRWALLEX_ACCOUNT_TZ`. |
| Rates | `client_rate`, `mid_rate`, `awx_rate`, `conversion.rate` are quoted in `currency_pair` **market convention** (e.g. `AUDUSD`), not in our direction | Our canonical price `p` (H per 1 F) is **always** `sell_amount / buy_amount`. To show a reference rate in our orientation use `orient(rate, currency_pair, F, H)`: `rate` if `currency_pair = F+H`, `1/rate` if `H+F`. |
| Identifiers | `id`/`quote_id`/`conversion_id` are UUIDs; `short_reference_id` is the support-friendly ref (`P250709-J48HB2M`) | UI shows `short_reference_id` prominently and the UUID in a copyable detail row. |
| Auth token | Valid **30 minutes**; `expires_at` is authoritative | Refresh 60 s before `expires_at` (04 §1). |

### 1.1 Currency precision

The Payouts precision table (our source of truth for `transfer_amount`) is ISO 4217 **with exceptions**:

| Decimals | Currencies |
| --- | --- |
| 0 | CLP, ISK, JPY, **KES**, KRW, PYG, RWF, **SAR**, VND, XAF, XOF |
| 3 | BHD, JOD, KWD, OMR, TND |
| 2 | everything else in the table |

**KES and SAR are 2 dp in ISO but 0 dp for Airwallex payouts.** The FX guide says conversion amounts round to ISO decimals. Until V14 settles which one wins, `currencies.ts` stores `payoutPrecision` (from the Payouts table) and `isoPrecision` separately. Bill amounts, `AmountInput` masking and `transfer_amount` use `payoutPrecision`. Field error `042` ("too many decimals") is the symptom of getting this wrong.

### 1.2 Currency capability

From [Supported regions and currencies](https://www.airwallex.com/docs/transactional-fx/supported-regions-and-currencies.md). Each currency has four flags: `buy`, `sell`, `pureConversion` (hold in wallet) and `convertAndPayout`. Examples:

- **Buy-only, payout-only** (the bill can be in it, the wallet can't hold it): INR, PHP, PKR, BDT, LKR, KES, NGN, TRY, SAR, and others.
- **Conditionally sellable:** IDR (sell only for CN/HK customers), MYR (MY customers), AED (not UAE customers).

`currencies.ts` ships this static table. At runtime, `GET /reference/supported_currencies` returns the account-specific `buy_currencies`/`sell_currencies`, which are cached for 24 h and **override** the static flags. `CurrencySelect` disables a currency when it isn't in the runtime list and shows the reason tooltip "Not enabled on this Airwallex account".

---

## 2. Error model

Every Airwallex error has the same envelope:

```json
{ "code": "invalid_argument", "source": "first_name", "message": "Value is too short", "details": { "reason": "..." } }
```

`validation_failed` (from transfers create/validate and beneficiaries create/validate/update) instead carries **per-field errors** and no top-level `source`:

```json
{ "code": "validation_failed", "message": "...",
  "details": { "errors": [
    { "source": "beneficiary.address.postcode", "code": "030" },
    { "source": "beneficiary.address.street_address", "code": "018", "params": { "length_min": 5, "length_max": 200 } } ] } }
```

`errors.ts` normalises both into `AirwallexError { status, code, message, source?, details?, fieldErrors?: FieldError[] }`. Our API then returns `{ error: ApiError }` (§8).

### 2.1 Error codes → our codes → UI

Error names **differ by endpoint** for the same condition (for example, `transfers/create` says `quote_expired` and `fx/conversions/create` says `expired_quote`). `errors.ts` maps both spellings.

| Airwallex code(s) | Endpoint(s) | Our `ApiError.code` | Server action | UI |
| --- | --- | --- | --- | --- |
| `validation_failed` | transfers create/validate, beneficiaries create/validate/update | `VALIDATION_FAILED` + `fieldErrors` | No retry. Bill stays in (or returns to) review. | Inline errors on the matching form fields (§2.2); `Banner` summary on the ticket |
| `quote_expired` · `expired_quote` | transfers/create · conversions/create | `QUOTE_EXPIRED` | Stay `WATCHING` and retry (04 §2.3) | Toast "Quote expired · still watching" |
| `quote_id_invalid` · `invalid_quote_id` · `conflict_original_ccy` | transfers/create · conversions/create | `QUOTE_INVALID` | Re-quote once; if it fails again, `FAILED` | Same as expired, with "re-quoted" note |
| `quote_id_required` | transfers/create | `AIRWALLEX_CONFIG` | Account requires quotes: never omit `quote_id` (affects the auto-settle path) | Error banner "Airwallex account configuration" |
| `duplicate_request_id` · `request_id_duplicate` (legacy) | transfers/create | *(not an error)* | `details.id` is the existing transfer: `GET /transfers/{id}` and continue as success | none |
| HTTP 409 `request_pending` | transfers/create | *(not an error)* | The same `request_id` is still in flight: back off and retry with the same `request_id`; the reconciler covers exhaustion | Ticket stays `EXECUTING` |
| `balance_insufficient` · `insufficient_funds` · `open_position_limit_exceeded` · `credit_limit_exceeded` | transfers · conversions | `INSUFFICIENT_BALANCE` | Stay `WATCHING`, set `insufficientBalance`, retry until the cutoff | `BalancePill` red; banner with a top-up CTA in demo |
| `amount_above_limit` · `amount_below_limit` | rates, quotes, conversions (default **$1 – $5,000,000 USD** equivalent) | `AMOUNT_LIMIT` | Flag the bill; block arming | Review warning "Outside Airwallex FX limits ($1–$5M)" |
| `*_above_account_limit` · `*_below_account_limit` · `amount_*_transfer_method_limit` · `amount_beneficiary_receives_below_limit` · `amount_beneficiary_receives_above_cumulative_limit` | transfers create/validate | `AMOUNT_LIMIT` (+ `params.amount_min/amount_max/_currency`) | No retry | Shows the limit from `params`; suggests the other transfer method when the schema's limits allow it (§5.3) |
| `unsupported_currency` · `transfer_currency_unsupported` · `source_currency_unsupported` · `currency_pair_invalid` | rates, quotes, transfers | `ROUTE_UNSUPPORTED` | Block arming | Review error on the currency field |
| `transfer_method_unsupported` · `payout_method_unsupported` · `beneficiary_type_unsupported` | transfers | `ROUTE_UNSUPPORTED` | Block arming | Review error on the transfer-method field |
| `transfer_date_invalid` · `invalid_settlement_date` · `invalid_conversion_date` | transfers · rates/quotes · conversions | `DATE_INVALID` | Only reachable on the Layer B / convert-and-hold paths | Error on the date |
| `declaration_required` · `order_amount_insufficient` · `order_reconciliation_failed` · `order_info_unsupported` | transfers (CNY local only) | `CORRIDOR_REQUIREMENT` | CNY local is out of scope; generator never produces it | Review error "Corridor needs extra compliance steps" |
| `update_unsupported` | transfers/cancel | `TRANSFER_NOT_CANCELLABLE` | No retry | Toast "Already sent, can't be cancelled" |
| `transfer_not_found` · `not_found` | retrieve/cancel | `NOT_FOUND` | Reconciler logs and alerts | |
| 401 `credentials_invalid` · `credentials_expired` | all | *(internal)* | Drop the token, log in once, retry once; then `AIRWALLEX_ERROR` | `ConnectionIndicator` → degraded |
| 403 `forbidden` | all | `AIRWALLEX_CONFIG` | Missing API-key scope; no retry | Error banner naming the endpoint group |
| 429 | all | `RATE_LIMITED` (only if retries are exhausted) | Backoff + jitter (04 §1) | Stale-feed indicator on the chart |
| 5xx · `service_unavailable` · `operation_failed` | all | `AIRWALLEX_UNAVAILABLE` | Retry with the **same** `request_id`; the reconciler resolves unknown outcomes | `ConnectionIndicator` degraded; ticket keeps its state |
| `fee_unknown` · `workflow_invalid` · `term_agreement_is_required` · `incorrect_version` | transfers · conversions | `AIRWALLEX_CONFIG` | No retry; fix account setup | Error banner |

### 2.2 Field validation codes (`001`–`102`) → form copy

`fieldErrorMessage(code, params)` lives in `src/contracts/airwallex-errors.ts` (pure, shared, unit-tested). The field `source` (an Airwallex path like `beneficiary.bank_details.iban`) is mapped to our form path by the beneficiary schema form (§5.2), so the error lands on the right input.

| Codes | Meaning | Copy (with params) |
| --- | --- | --- |
| `001` | Required | "Required" |
| `002`–`007`, `012`–`014`, `090` | Character set / whitespace / emoji | "Only letters, numbers and basic punctuation" (variant per code) |
| `008`, `009`, `015`, `042`, `101` | Numeric / positive / decimals / range | "Max {decimals} decimals", "Between {min} and {max}" |
| `010`, `011`, `016`, `017` | Invalid value / format / not in enum | "Must be one of {values}" when `params` lists them |
| `018`–`022` | Length | "{length_min}–{length_max} characters" |
| `023` | Metadata limits (≤ 15 keys) | internal bug: log, never shown |
| `025`–`027` | Date format / not before today | "Use a date from today" |
| `028`, `029`, `030`, `092`, `099`, `100` | PO box / email / postcode / phone | Field-specific copy |
| `031`, `040`, `043`, `024` | Currency or method mismatch | "This bank can't receive {ccy} via {method}" |
| `032`, `033` | SWIFT/BIC invalid or country mismatch | "SWIFT code doesn't match the bank country" |
| `035`, `082`, `086`, `087`, `088` | Bank / branch / transit code | "Bank or branch code not recognised" |
| `036`, `091` | IBAN country mismatch / IBAN-or-local missing | "IBAN doesn't match the bank country" |
| `037`, `038` | Amount above/below the limit | "Max {amount_max} {amount_max_currency}" |
| `039`, `085` | Account invalid at that bank | "Account number not valid for this bank" |
| `044`–`048`, `050` | ID conflicts / unexpected | internal bug or `AIRWALLEX_ERROR` |
| anything else | unknown | Airwallex `message` verbatim + code in a tooltip |

---

## 3. FX: rates and quotes

### 3.1 Current rate → `rate_ticks` → chart and `PriceDisplay`

`GET /api/v1/fx/rates/current?buy_currency=F&sell_currency=H&buy_amount=A`

| Airwallex field | Contract / storage | Notes |
| --- | --- | --- |
| `rate_details[level=CLIENT].sell_amount / .buy_amount` | `rate_ticks.price` → `ChartSeriesPoint.value`, `BillSummary.lastPrice` | Canonical `p`. If there is no CLIENT entry, the tick is dropped and logged (V2). |
| `created_at` | `rate_ticks.ts` | Airwallex's timestamp, not our receive time |
| `conversion_date` | `rate_ticks.raw` | The settlement date this price assumes. `QuoteCard` shows "Settles {date}" |
| `currency_pair`, `rate` | `raw` only | Market-convention rate; never used for `p` |
| `dealt_currency` | assert `= F` | Mismatch = request bug |

### 3.2 Quote → `quotes` → `QuoteSummary` → `QuoteCard`

`POST /api/v1/fx/quotes/create` with `validity ∈ MIN_1 | MIN_15 | MIN_30 | HR_1 | HR_4 | HR_8 | HR_24`.

| Airwallex field | `QuoteSummary` field | UI |
| --- | --- | --- |
| `quote_id` | `airwallexQuoteId` | Copyable ID row |
| `sell_amount / buy_amount` | `price` | Hero price (pip emphasis) |
| `sell_amount`, `buy_amount` | `sellAmount`, `buyAmount` | `CostBreakdown` |
| `client_rate` | `clientRate` (market convention) + `clientRateOriented` | Detail row "Airwallex rate {pair}" |
| `mid_rate` | `midPrice` = `orient(mid_rate)` | Detail row "Mid"; `spreadBps` = `(price − midPrice) / midPrice × 10⁴`, shown as "Spread vs mid · {n} bps" (reference only) |
| `awx_rate` | `raw` only | Not displayed (reference-only per docs) |
| `valid_from_at`, `valid_to_at` | `validFromAt`, `validToAt` | Validity countdown; `expired` variant at `validToAt` |
| `validity` | `validity` | |
| `usage` | `usage` (`SINGLE_USE` \| `MULTI_USE`) | Not shown. We **never reuse** a quote across bills or attempts regardless of `usage`. |
| `conversion_date` | `conversionDate` | "Settles {date}" |

**Note:** the API reference lists both `SINGLE_USE` and `MULTI_USE`. Earlier notes (01 §2) said quotes are always `MULTI_USE`; we store the value and don't depend on it.

---

## 4. Transfers

### 4.1 Request fields we set (`POST /api/v1/transfers/create`)

| Field | Value | Where it comes from / UI |
| --- | --- | --- |
| `request_id` | `tr:{billId}:{attempt}` (≤ 64 chars; deduped for **7 days**) | 04 §1 |
| `beneficiary_id` | the resolved beneficiary | `BeneficiaryCard` |
| `transfer_currency`, `transfer_amount` | F, A (payout precision) | the bill |
| `source_currency` | H | settings |
| `quote_id` | the quote locked for this payment | `QuoteCard` |
| `transfer_method` | `LOCAL` \| `SWIFT` | Review → method picker (§5.3) |
| `reason` | **required** enum; default `bill_payment` | Review: `Select` with the enum below; the bill stores `transferReason` |
| `reference` | **required**; default = invoice number | Review: `Input`; length/charset errors come back as `018`/`002` from `transfers/validate` at arming (§4.4) |
| `fee_paid_by` | `PAYER` (default) | Fixed, shown in `CostBreakdown` |
| `swift_charge_option` | SWIFT only: `PAYER` (proposed, D-18) | So the vendor receives the full invoice amount; `CostBreakdown` shows "SWIFT charges: paid by you" |
| `metadata` | `{ bill_id, app }` (≤ 15 keys) | none |
| `transfer_date` | **omitted** (dispatch ASAP; setting it, even to today, routes through scheduled-transfer logic) | none |

`reason` values: `audio_visual_services`, `bill_payment`, `business_expenses`, `construction`, `donation_charitable_contribution`, `education_training`, `freight`, `goods_purchased`, `investment_capital`, `investment_proceeds`, `living_expenses`, `loan_credit_repayment`, `medical_services`, `pension`, `professional_business_services`, `real_estate`, `taxes`, `technical_services`, `transfer_to_own_account`, `travel`, `wages_salary`, `other_services`. (Israel-registered payers use a different list; out of scope.) The generator picks from `goods_purchased`, `professional_business_services`, `freight`, `technical_services`, `bill_payment`.

### 4.2 Response → `executions` → `ExecutionSummary` → `TransferTracker`

| Airwallex field | `ExecutionSummary` field | UI |
| --- | --- | --- |
| `id` | `transferId` | Copyable detail row |
| `short_reference_id` | `shortReferenceId` | Primary ID shown on the ticket ("Ref P250709-J48HB2M") |
| `request_id` | `requestId` | Detail row |
| `status` | `status` (§4.3) | `TransferStatusPill` |
| `funding.status`, `funding.failure_reason` | `funding` (§4.3) | Funding sub-row in `TransferTracker`, shown when not `FUNDED` |
| `conversion.rate`, `conversion.currency_pair` | `rate` (oriented to `p`), `rawRate` | "Executed at" price |
| `source_amount`, `source_currency` | `sourceAmount`, `sourceCurrency` | |
| `transfer_amount`, `transfer_currency` | `transferAmount`, `transferCurrency` | |
| `amount_payer_pays` | `amountPayerPays` | `CostBreakdown` **total** (locked) |
| `amount_beneficiary_receives` | `amountBeneficiaryReceives` | "Vendor receives" (warn if < invoice amount) |
| `fee_amount`, `fee_currency` (= source currency), `fee_paid_by` | `fee { amount, currency, paidBy }` | `CostBreakdown` fee row |
| `swift_charge_option` | `swiftChargeOption` | `CostBreakdown` note |
| *(status before `SCHEDULED`)* | `amountsTentative: true` | Amounts in muted style with "tentative" until `SCHEDULED` confirms the rate |
| `transfer_method` | `transferMethod` | |
| `transfer_date`, `dispatch_date` | `transferDate`, `dispatchDate` | Timeline "Dispatched {date}" |
| `failure.code`, `failure.message`, `failure.details.reason_codes` | `failure { code, message, reasonCodes, category }` | `FAILED` variant: message + category copy (§4.5) |
| `updated_at` | `updatedAt` | Ordering guard for webhooks (never delivery order) |
| `prepayment` | `raw` only | Layer B path only |

### 4.3 Status maps

**Transfer status** (API version ≥ 2025-06-30):

| Airwallex | Our bill state | `TransferStatusPill` | Notes |
| --- | --- | --- | --- |
| `IN_APPROVAL`, `APPROVAL_RECALLED`, `APPROVAL_REJECTED`, `APPROVAL_BLOCKED` | `IN_FLIGHT` + `flags.awxApproval` | "Awaiting Airwallex approval" (amber) | Only if an Airwallex transfer-approval workflow is on. **The sandbox runbook disables it** (D-23: those transfers cannot use quotes). Seeing these is a config alert. |
| `SCHEDULED` | `IN_FLIGHT` | Scheduled | The rate and fee are now confirmed (`amountsTentative = false`) |
| `OVERDUE` | `IN_FLIGHT` + `flags.overdue` | Overdue (red) + funding status | Not funded by the transfer date. Airwallex **auto-cancels** unfunded pre-funded transfers at the end of the day. |
| `PROCESSING` | `IN_FLIGHT` | Processing | RFI may be requested (out of scope) |
| `SENT` | `IN_FLIGHT` | Sent | Can still fail downstream |
| `PAID` | `PAID` | Paid | **Not final:** keep listening for `payout.transfer.failed` (`lateFailureWatchUntil` = +72 h) |
| `FAILED` | `FAILED` | Failed · {category} | Airwallex **auto-cancels a failed transfer within seconds**. The following `CANCELLED` must **not** overwrite `FAILED`. |
| `CANCELLED` | `CANCELLED` if we requested it (or `OVERDUE` auto-cancel → `FAILED` "Not funded"); otherwise ignored after `FAILED` | Cancelled | |

The monotonic rank guard (04 §2.4) becomes `SCHEDULED = OVERDUE (1) < PROCESSING (2) < SENT (3) < PAID (4)`. `FAILED` may override any status, including `PAID` (late failure). `CANCELLED` applies only from a non-terminal status.

**Funding status** (`funding.status`): `REQUIRES_FUNDING_CONFIRMATION`, `SCHEDULED`, `PROCESSING`, `FUNDED`, `FAILED`, `CANCELLED`, `REVERSED` (direct debit only). We are pre-funded from the wallet, so `REQUIRES_FUNDING_CONFIRMATION` (manual-funding mode, `confirm_funding`) shouldn't appear; if it does, it's a config alert. The UI shows funding only when it isn't `FUNDED`: `PROCESSING` → "Funding from wallet…", `FAILED` → "Funding failed · {failure_reason}".

### 4.4 Validation at arming

`POST /transfers/validate` accepts the same body as create (no `quote_id` needed) and returns `200 OK` or a `validation_failed` / limit error. We call it **when the user arms** (not only in the executor pre-flight), so bad references, account limits, method limits and beneficiary problems show up in review, not at trigger time. Its errors use the tables in §2.

### 4.5 Failure categories

Real transfer failures carry `failure { code, message, details.reason_codes }`; the example shows `code: "90502"`, `details.type: "TM_SUSPEND"`. The sandbox simulation accepts a `failure_type`. `failureCategory()` groups them so the UI can give a next step:

| Category | `failure_type` values (simulation) | UI next step |
| --- | --- | --- |
| `BENEFICIARY_DETAILS` | `INVALID_ACCOUNT_NAME_OR_NUMBER`, `INVALID_BANK_INFORMATION`, `INVALID_BANK_OR_BRANCH_CODE`, `INVALID_BENEFICIARY_DETAILS`, `INVALID_SWIFT_BIC_CODE`, `INVALID_CORRESPONDENT_BANK_INFORMATION`, `BENEFICIARY_NAME_MISMATCH`, `INVALID_SPECIAL_CHARACTER`, `ACCOUNT_CURRENCY_MISMATCH` | "Fix the vendor's bank details" → opens beneficiary edit |
| `ACCOUNT` | `ACCOUNT_CLOSED`, `ACCOUNT_INACTIVE_OR_DORMANT`, `ACCOUNT_UNDER_RESTRICTION` | "Vendor account can't receive funds, so contact the vendor" |
| `RETURNED` | `BENEFICIARY_BANK_RETURNED`, `BENEFICIARY_REQUESTED`, `RECALL_REQUESTED`, `DUPLICATION_RETURN` | "Returned by the vendor's bank" |
| `FUNDS_OR_LIMITS` | `INSUFFICIENT_FUNDS`, `EXCEEDED_TRANSACTION_AMOUNT_OR_LIMIT`, `TRANSACTION_AMOUNT_NOT_COVERING_FEE` | "Top up or reduce the amount" |
| `COMPLIANCE` | `TM_SUSPENDED`, `INVALID_PAYMENT_PURPOSE`, `CHANNEL_POLICY` | "Held for compliance review" (+ "change reason" for purpose) |
| `CLIENT` | `CLIENT_REQUESTED` | "Cancelled at your request" |
| `SYSTEM` | `SYSTEM_ERROR`, `CHANNEL_TIMEOUT`, `CARD_ISSUER_ERROR`, `UNABLE_TO_APPLY`, `OTHER`, `INBOUND_*` | "Airwallex couldn't process it, so retry" |

How `failure_type` shows up in the real `failure` object is not documented. **V15** records the object for each type in sandbox, and the mapper matches on `failure.details.type`/`reason_codes` first, then `code`, then falls back to `SYSTEM`.

---

## 5. Beneficiaries

### 5.1 Stored summary → `BeneficiarySummary` → `BeneficiaryCard`

From `POST /beneficiaries/create` and `GET /beneficiaries/{id}`: `id` → `airwallexBeneficiaryId`; `beneficiary.company_name` (or first/last name) → `name`; `entity_type`; `bank_details.bank_country_code`, `account_currency`, `bank_name`; masked `account_number`/`iban` (last 4); `transfer_methods[]`; `nickname`. Bank fields are never stored unmasked (04 §2.6).

### 5.2 Dynamic form → `BeneficiaryFormSchema` → `SchemaForm`

`POST /api/v1/beneficiary_form_schemas/generate` with `{ bank_country_code, account_currency, transfer_method, entity_type, country_code? }` returns `fields[]`. Each field has:

| Airwallex | `FormSchemaField` | Rendering (`SchemaForm`, a new pattern in `src/ui/patterns`) |
| --- | --- | --- |
| `path` (`beneficiary.bank_details.iban`) | `path` | Form state key; also the key that §2.2 `FieldError.path` matches |
| `field.key`, `label`, `placeholder`, `description`, `tip`, `example`, `default` | same | Label, placeholder, help text, tooltip, prefilled value |
| `field.type` | `type`: `INPUT` \| `SELECT` \| `DYNAMIC_SELECT` \| `RADIO` \| `TRANSFER_METHOD` | `Input` / `Select` / async `Combobox` / `Radio` / `TransferMethodPicker` |
| `field.options[]` | `options[] { label, value, description? }` | |
| `options[].transfer_limit.{min,max}`, `options[].flight_time.{min,max}` (ISO 8601 durations, e.g. `P0D`–`P3D` = 0–3 business days) | `options[].transferLimit`, `options[].flightTime` | `TransferMethodPicker` shows "Arrives in 0–3 business days · max 1,000,000 EUR" |
| `field.refresh` | `refresh` | Changing this field refetches the schema (debounced) and keeps values for paths that still exist |
| `field.dynamic_options.{query_url, query_params[{name, value_of, required, pattern}]}` | `dynamic` | Async combobox that calls **our** proxy (§5.4) with params read from the form at `value_of` |
| `required`, `enabled` | same | Required marker; disabled/hidden |
| `rule.type`, `rule.pattern` | `pattern` | Client-side regex validation before submit |

Rules: the browser never calls Airwallex directly (our server proxies with the token); `SchemaForm` stays props-only (`schema`, `values`, `errors`, `onChange`, `onSearch(path, query)`), and the feature layer wires the proxies; schemas are cached per condition for 24 h; the API schema (`POST /beneficiary_api_schemas/generate`) is used only server-side by the seeder (B2.2) to build payloads.

### 5.3 Method, lead days and limits

`TRANSFER_METHOD` options give us, per corridor, the available methods with **limits** and **flight time**. This replaces two constants:

- Default `leadDays` for the bill = the chosen option's `flightTime.max` in business days, then +1 business day of buffer. Fall back to `LOCAL = 1` / `SWIFT = 3` (03 §3) when the schema doesn't provide it.
- An amount outside `transferLimit` blocks that option in the picker ("Above LOCAL limit, so use SWIFT").

### 5.4 Bank search, validate, verify

| Call | Contract | UI |
| --- | --- | --- |
| `GET /beneficiary_form_schemas/supported_financial_institutions?account_currency&bank_country_code&entity_type&transfer_method&keyword&bank_identifier` → `items[{label, value}]`, `truncated` | `BankOption { label, routingValue }`, `truncated` | `DYNAMIC_SELECT` combobox; when `truncated`, shows "Keep typing to narrow results" |
| `POST /beneficiaries/validate` → `200` or `validation_failed` | `FieldError[]` | Inline errors before create |
| `POST /beneficiaries/verify_account` → `code`, `details.account_name_match_result`, `resolved_account_name`, `resolved_bank_name` | `AccountVerification` | `BeneficiaryCard` verification badge (below) |

Account verification is **LOCAL only** and covers SEPA countries (Verification of Payee), the UK (Confirmation of Payee) and Viet Nam (NAPAS); Australia is upcoming. Elsewhere we set `code: 'NOT_SUPPORTED'` without calling. `BeneficiaryCard` variants:

| `code` / `nameMatch` | Badge | Arming |
| --- | --- | --- |
| `VERIFIED` / `FULL_MATCH` | "Verified · name matches" (green) | allowed |
| `VERIFIED` / `PARTIAL_MATCH` · `FULL_MATCH_INCORRECT_TYPE` · `PARTIAL_MATCH_INCORRECT_TYPE` | "Name partially matches: {resolved name}" (amber) | requires an explicit "I've confirmed with the vendor" checkbox |
| `VERIFIED` / `NOT_MATCHED` | "Name doesn't match: {resolved name}" (red) | same confirmation, danger style |
| `INVALID` | "Account doesn't exist" (red) | **blocked** (Airwallex rejects transfers to it) |
| `CANNOT_VERIFY` · `EXTERNAL_SERVICE_UNAVAILABLE` · `NOT_SUPPORTED` | "Not verified" (muted) | allowed |

---

## 6. Balances and reference data

| Call | Contract | UI / logic |
| --- | --- | --- |
| `GET /balances/current` → `[{ currency, available_amount, pending_amount, reserved_amount, prepayment_amount, total_amount, account_type }]` (use `account_type = cash`) | `BalanceSummary { currency, available, pending, reserved, total, asOf }` | `BalancePill` shows `available`; tooltip shows pending/reserved. Pre-flight compares **`available`** with `quote.sellAmount + fee` (`reserved` already holds in-flight payouts). Cash rows whose currency is outside the payout table are omitted. Sandbox wallets still return retired `HRK`. |
| `GET /balances/history` → `items[{ amount, balance, currency, source, source_type, transaction_type, posted_at }]`, `page_after` | *(not in contracts)* | Optional "Wallet activity" drawer; reconciler cross-check that a `TRANSFER` debit exists after `PAID` |
| `GET /reference/supported_currencies` | runtime override of `CurrencyInfo.fx` (§1.2) | `CurrencySelect` disabled state |
| `GET /reference/invalid_conversion_dates?currency_pair=HF` → `[{ date, reason }]` | `NonConversionDay { date, reason }` | **Deadline math skips these dates** in addition to weekends (03 §3). `DeadlineMeter` and the strategy step show "Skipped {date}: {reason}". Cached per pair for 24 h. |
| `GET /reference/order_items/quota?type=ID_OUTBOUND\|VN_OUTBOUND` → `{ available_order_amount, currency }` | `CorridorQuota` | IDR and VND bills: review warning when the bill exceeds the available quota |

---

## 7. Webhooks

The envelope is `{ id, name, account_id, data: { object }, created_at, version }`. `data.object` has **the same schema as the resource's Retrieve API**, so the webhook processor reuses the retrieve mappers (§4.2). No second mapping exists.

- Transfer events: `payout.transfer.{in_approval, approval_recalled, approval_rejected, approval_blocked, scheduled, overdue, processing, sent, paid, failed, cancellation_requested, cancelled}`.
- Funding events: `payout.transfer.funding.{requires_funding_confirmation, scheduled, processing, funded, failed, cancelled, reversed}`.
- `version` should equal `AIRWALLEX_API_VERSION`. On a mismatch, log a warning and still process (fields may differ).
- Signature: `HMAC-SHA256(secret, x-timestamp + rawBody)` hex, where `x-timestamp` is **Unix milliseconds**. Respond `200` immediately; Airwallex retries on anything else (04 §3).

---

## 8. Contract additions (`src/contracts`)

These extend [03 §5](./03-domain-model.md#5-contracts-shared-febe). They are defined in C0.1, with zod schemas and fixtures for every enum value.

```ts
// airwallex.ts: enums mirrored from the API (values exactly as Airwallex sends them)
type TransferStatus = 'IN_APPROVAL'|'APPROVAL_RECALLED'|'APPROVAL_REJECTED'|'APPROVAL_BLOCKED'
  |'SCHEDULED'|'OVERDUE'|'PROCESSING'|'SENT'|'PAID'|'FAILED'|'CANCELLED';
type FundingStatus = 'REQUIRES_FUNDING_CONFIRMATION'|'SCHEDULED'|'PROCESSING'|'FUNDED'|'FAILED'|'CANCELLED'|'REVERSED';
type TransferMethod = 'LOCAL'|'SWIFT';
type TransferReason = 'bill_payment'|'goods_purchased'|'professional_business_services'|'freight'
  |'technical_services'|'business_expenses'|'construction'|'other_services' /* …full list in §4.1 */;
type QuoteValidity = 'MIN_1'|'MIN_15'|'MIN_30'|'HR_1'|'HR_4'|'HR_8'|'HR_24';
type FailureCategory = 'BENEFICIARY_DETAILS'|'ACCOUNT'|'RETURNED'|'FUNDS_OR_LIMITS'|'COMPLIANCE'|'CLIENT'|'SYSTEM';

interface QuoteSummary {
  airwallexQuoteId: string;
  price: string;                 // p = sell/buy (H per F)
  sellAmount: string; buyAmount: string;
  clientRate: string; clientRateOriented: string; midPrice?: string; spreadBps?: number;
  validity: QuoteValidity; validFromAt: string; validToAt: string;
  usage: 'SINGLE_USE'|'MULTI_USE';
  conversionDate: string;
}

interface ExecutionSummary {
  transferId: string; shortReferenceId: string; requestId: string;
  status: TransferStatus;
  funding?: { status: FundingStatus; failureReason?: string };
  transferMethod: TransferMethod;
  rate: string;                  // conversion.rate oriented to p
  sourceAmount: string; sourceCurrency: Ccy;
  transferAmount: string; transferCurrency: Ccy;
  amountPayerPays?: string; amountBeneficiaryReceives?: string;
  fee?: { amount: string; currency: Ccy; paidBy: 'PAYER'|'BENEFICIARY' };
  swiftChargeOption?: 'SHARED'|'PAYER';
  amountsTentative: boolean;     // true until SCHEDULED
  transferDate?: string; dispatchDate?: string;
  failure?: { code?: string; message?: string; reasonCodes?: string[]; category: FailureCategory };
  lateFailureWatchUntil?: string;
  updatedAt: string;
  mode: 'TARGET'|'DEADLINE'|'MANUAL';
}

interface BalanceSummary { currency: Ccy; available: string; pending: string; reserved: string; total: string; asOf: string }

interface CurrencyInfo {
  code: Ccy; name: string;
  payoutPrecision: number; isoPrecision: number;
  fx: { buy: boolean; sell: boolean; pureConversion: boolean; convertAndPayout: boolean; note?: string };
  enabledOnAccount?: { buy: boolean; sell: boolean };   // from supported_currencies
}

interface BeneficiarySummary {
  id: string; airwallexBeneficiaryId: string; name: string;
  entityType: 'COMPANY'|'PERSONAL'; bankCountry: string; accountCurrency: Ccy;
  bankName?: string; maskedAccount: string; transferMethods: TransferMethod[];
  verification?: AccountVerification;
}
interface AccountVerification {
  code: 'VERIFIED'|'INVALID'|'CANNOT_VERIFY'|'EXTERNAL_SERVICE_UNAVAILABLE'|'NOT_SUPPORTED';
  nameMatch?: 'FULL_MATCH'|'PARTIAL_MATCH'|'NOT_MATCHED'|'FULL_MATCH_INCORRECT_TYPE'|'PARTIAL_MATCH_INCORRECT_TYPE';
  resolvedAccountName?: string; resolvedBankName?: string; checkedAt: string;
}

interface BeneficiaryFormSchema {
  condition: { bankCountry: string; accountCurrency: Ccy; transferMethod: TransferMethod; entityType: 'COMPANY'|'PERSONAL' };
  fields: FormSchemaField[];
}
interface FormSchemaField {
  path: string; key: string; label: string;
  type: 'INPUT'|'SELECT'|'DYNAMIC_SELECT'|'RADIO'|'TRANSFER_METHOD';
  required: boolean; enabled: boolean; refresh: boolean;
  default?: string; placeholder?: string; description?: string; tip?: string; example?: string; pattern?: string;
  options?: Array<{ label: string; value: string; description?: string;
    transferLimit?: { min?: { amount: string; currency: Ccy }; max?: { amount: string; currency: Ccy } };
    flightTime?: { min?: string; max?: string } }>;          // ISO 8601 durations
  dynamic?: { params: Array<{ name: string; valueOf: string; required: boolean; pattern?: string }> };
}
interface BankOption { label: string; routingValue: string }
interface NonConversionDay { date: string; reason: string }
interface CorridorQuota { type: 'ID_OUTBOUND'|'VN_OUTBOUND'; available: string; currency: Ccy }

interface FieldError { path: string; code: string; message: string; params?: Record<string, string|number> }
interface ApiError {
  code: 'INVALID_STATE'|'FORBIDDEN'|'NOT_FOUND'|'VALIDATION_FAILED'|'QUOTE_EXPIRED'|'QUOTE_INVALID'
    |'INSUFFICIENT_BALANCE'|'AMOUNT_LIMIT'|'ROUTE_UNSUPPORTED'|'DATE_INVALID'|'CORRIDOR_REQUIREMENT'
    |'TRANSFER_NOT_CANCELLABLE'|'RATE_LIMITED'|'AIRWALLEX_UNAVAILABLE'|'AIRWALLEX_CONFIG'|'AIRWALLEX_ERROR';
  message: string;
  fieldErrors?: FieldError[];
  details?: unknown;
  airwallex?: { code: string; source?: string };   // original code, for the tooltip and logs
}
```

`BillSummary` gains `transferMethod`, `transferReason`, `reference` and `beneficiary?: BeneficiarySummary`. Its `flags` gain `awxApproval`, `overdue`, `amountLimit`, `routeUnsupported` and `nameMismatch`. A locked quote on the ticket is a `QuoteSummary`.

**New internal REST endpoints** (server proxies; the browser never holds an Airwallex token):

| Method | Path | Wraps |
| --- | --- | --- |
| `POST` | `/api/beneficiaries/schema` | `beneficiary_form_schemas/generate` (cached) |
| `GET` | `/api/beneficiaries/banks` | `supported_financial_institutions` |
| `POST` | `/api/beneficiaries/validate` · `/verify` | `beneficiaries/validate` · `verify_account` |
| `GET` | `/api/reference/currencies` | static table + `supported_currencies` |
| `GET` | `/api/reference/non-conversion-days?pair=` | `invalid_conversion_dates` |
| `POST` | `/api/bills/:id/validate-transfer` | `transfers/validate` (also called by `arm`) |

---

## 9. UI impact (U-track)

| Component (06) | New from this doc |
| --- | --- |
| `CurrencySelect` | Groups by capability (§1.2); disabled "not enabled on this account"; buy-only badge |
| `AmountInput`, `MoneyDisplay` | `payoutPrecision` (KES/SAR 0 dp) |
| `QuoteCard` | "Settles {conversionDate}", "Spread vs mid · n bps", `usage` ignored |
| `CostBreakdown` | Locked mode from `ExecutionSummary`: fee (paid by), SWIFT-charge note, "Vendor receives", **tentative** styling until `SCHEDULED` |
| `TransferStatusPill` | Every `TransferStatus` incl. `IN_APPROVAL`-family ("Awaiting Airwallex approval") and a late-failure variant ("Failed after paid") |
| `TransferTracker` | Funding sub-row, `shortReferenceId` primary, dispatch date, failure category + next step (§4.5) |
| `BalancePill` | Tooltip with available / pending / reserved |
| `BeneficiaryCard` | Verification badges (§5.4 table) |
| **`SchemaForm`** *(new pattern)* | Renders `BeneficiaryFormSchema`: all five field types, refresh, async bank search, `FieldError` mapping. Kit fixtures: EUR/IBAN (DE), GBP/sort code, INR/IFSC (SWIFT + LOCAL), USD/ACH |
| **`TransferMethodPicker`** *(new primitive)* | Options with flight time and limits; over-limit option disabled with reason |
| `ExtractionReview` | Reason `Select`, reference `Input`, `SchemaForm` for "Create in Airwallex", inline `FieldError`s from validate-at-arm |
| `DeadlineMeter` / `StrategyWizardStep` | Skipped non-conversion days; lead days from flight time |
| `Banner` / toast mapping (U7.3) | Every `ApiError.code` in §2.1 |

---

## 10. Sources

API reference (`https://www.airwallex.com/docs/api/…md`): `authentication/api_access_token/login`, `transactional_fx/rates/current`, `transactional_fx/quotes/create`, `…/quotes/retrieve`, `transactional_fx/conversion/create`, `…/conversion/retrieve`, `payouts/transfers/{create,retrieve,list,validate,cancel,confirm_funding}`, `payouts/beneficiaries/{create,retrieve,list,validate,verify_account,generate_beneficiary_api_schemas,generate_beneficiary_form_schemas,supported_financial_institutions}`, `core_resources/balances/{current,history}`, `supporting_services/reference_data/{supported_currencies,invalid_conversion_dates,quota}`, `simulation/transfers/transition`, `simulation/deposits/create`, `errors`, `data_types`.

Guides (`https://www.airwallex.com/docs/…md`): `payouts/transfers/create-a-transfer`, `…/create-a-transfer/transfer-statuses`, `payouts/transfers/validate-a-transfer`, `payouts/errors/transfer-error-codes`, `payouts/beneficiaries/using-api-and-form-schemas`, `…/validate-a-beneficiary`, `…/verify-a-beneficiary-account`, `…/retrieve-supported-beneficiary-banks`, `payouts/how-airwallex-payouts-work/currency-precision`, `transactional-fx/supported-regions-and-currencies`, `transactional-fx/troubleshooting/error-codes`, `developer-tools/webhooks/listen-for-webhook-events`, `…/listen-for-webhook-events/transfers`.
