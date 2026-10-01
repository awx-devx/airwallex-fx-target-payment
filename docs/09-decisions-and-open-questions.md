# 09 — Decisions & Open Questions

## Decisions (ADR-lite)

Status values: **Proposed** (default, open for objection), **Accepted**, **Superseded**.

| ID | Decision | Status | Rationale / alternatives |
| --- | --- | --- | --- |
| D-01 | Monorepo-less single Next.js app + separate Node **worker** process sharing `src/` | Accepted | Simplest to demo and deploy. Alternative: Turborepo with `apps/web`, `apps/worker`, `packages/*`. Can be split later without code changes thanks to the boundary rules. |
| D-02 | **MongoDB + Mongoose** as the database; **Redis** for BullMQ queues and pub/sub fan-out | Accepted | Team choice. Redis is needed: MongoDB has no job queue or cross-process push. Timers live in Mongo and a sweeper enqueues BullMQ jobs, which keeps the warp clock and restart catch-up simple. MongoDB runs as a replica set, which transactions require. See [02 §9](./02-architecture.md#9-mongodb--redis-conventions). |
| D-03 | Execute through **one `transfers/create` call with `quote_id`** (conversion inside the transfer) | Accepted | Works for buy-only currencies (INR, PHP, …) and gives one idempotency key and one status stream. See [01 §3.2](./01-feasibility-airwallex.md#32-buy-only-currencies--execute-through-a-single-transfer-not-conversion-then-payout). |
| D-04 | "Convert now, pay on due date" is **out of scope for the demo**. Pay immediately after approval. | Accepted | Needs V7 (quote + future `transfer_date`) or the convert-and-hold path (pure-convertible only). Revisit after the sandbox checks. |
| D-05 | Trigger on **indicative** rates and approve on a **quote** re-checked against the target | Accepted | Approvers always see a binding price. A near miss keeps watching. |
| D-06 | Approval runs **in our app**, not through Airwallex transfer approvals | Accepted | Airwallex approval-submitted transfers can't use quotes. |
| D-07 | Deadline guarantee = in-app scheduler (Layer A). The Airwallex scheduled-transfer safety net (Layer B) sits behind a flag. | Accepted | Layer B cost and cancellation semantics need V6. |
| D-08 | Standing instruction consent is **required to arm** a bill | Accepted | Reconciles "request approval on the final day" with "must be settled by the deadline in any case". |
| D-09 | Canonical price = `sell_amount / buy_amount` (H per F) from the CLIENT level | Accepted | Avoids `currency_pair` orientation bugs. |
| D-10 | Display pair `F/H`, lower = better; auto-offer inversion when price < 0.01 | Accepted | Consistent "buy low" mental model for the target line. |
| D-11a | Animation runs through **Motion** (`motion` on npm, formerly Framer Motion); CSS keyframes only for `glow-pulse` and skeleton shimmer | Accepted | One timing system, layout animations and reduced-motion support for free. Spec: [05 §6](./05-design-system.md#6-motion). |
| D-11 | Charts use TradingView Lightweight Charts v5 + custom series primitives | Accepted | Performance + price lines built in. Alternative: ECharts/visx (heavier or more work). |
| D-12 | UI kit rendered on our own `/dev/ui-kit` page (no Storybook) | Accepted | Stays in the app's real theme/runtime and is faster to set up. The showcase configs can later generate Storybook stories. |
| D-13 | Hybrid demo mode: simulated market + real sandbox quotes/transfers | Accepted | Keeps the demo lively while the money path stays real. Clearly labelled in the UI. |
| D-14 | History backfill from Frankfurter (ECB) behind `HistorySource` | Accepted | Free and keyless. Covers majors only; exotic pairs show own ticks. Alternatives: Open Exchange Rates, Twelve Data (paid, intraday). |
| D-15 | Bill extraction: deterministic readers (e-invoice XML, payment QR, text layer) + **Claude via the Anthropic API** (structured outputs, Haiku → Sonnet escalation) + validators + mandatory human review. Optional local Ollama adapter; `mock` for tests | Accepted (model defaults pending the B4.2b benchmark) | Airwallex OCR is web-app only. Claude reads PDFs natively (text + page images) and returns schema-valid JSON without a GPU, so it fits the single server. Local VLMs need a GPU and are weaker on scans. Spec: [12](./12-bill-extraction.md). |
| D-16 | Demo "Simulate" button: per-bill scripted price path → normal trigger → real sandbox quote → **auto-approve** → real sandbox transfer → driven to Paid (~26 s) | Accepted | One-click target-hit beat on stage, while the rest of the terminal can stay on the live feed. Auto-approval is a demo-only exception to "nothing is paid without approval", and it is always labelled. The GBP beat still shows human approval. Spec: [08 §1.1](./08-demo-plan.md#11-simulate-button). |
| D-17 | Seeded test-data generator (Faker + our PRNG; invoices rendered from React templates with Playwright; `sharp` for scanned variants) with profiles, pooled sandbox beneficiaries, and states reached only through real services | Accepted | Smooth, reproducible testing without hand-made fixtures. No fake Airwallex IDs, so sandbox data stays consistent. The same generators feed the mock `DataSource`. Spec: [11](./11-test-data-and-seeding.md). |
| D-18 | Bills are paid in full: `fee_paid_by: PAYER` and, for SWIFT, `swift_charge_option: PAYER` (Airwallex default is `SHARED`, which lets intermediary banks deduct from what the vendor receives) | Accepted | An invoice is settled only if the vendor receives the invoiced amount. The cost is shown in `CostBreakdown`; V17 checks whether Airwallex prices it at create time. Spec: [13 §4.1](./13-airwallex-contracts.md#41-request-fields-we-set-post-apiv1transferscreate). |
| D-19 | Contracts for Airwallex data follow the Airwallex API reference field by field (enums verbatim, lossless amounts, one mapper for Retrieve responses and webhook `data.object`), and `transfers/validate` runs at arming | Accepted | The UI kit can build every Airwallex-driven variant (statuses, funding, failures, verification, schema forms) before integration, and corridor or reference errors surface in review instead of at trigger time. Spec: [13](./13-airwallex-contracts.md). |
| D-21 | Bill extraction progress shows a **ThinkingOrb** (`thinking-orbs`, [libraries.dev/orbs](https://libraries.dev/orbs)) instead of the generic spinner | Accepted | Extraction is the one place a model is working, and the orb's states map onto the pipeline stages. It ships with no runtime dependencies. Spec: [07 §2](./07-pages-spec.md#2-upload--review-flow-upload-also-a-modal-over-the-terminal). |
| D-20 | UI primitives use **Radix** (`radix-ui`), icons use **Lucide**, dates use **date-fns** | Accepted | Already the stack in [02 §2](./02-architecture.md#2-stack-defaults-see-09) and [05 §8](./05-design-system.md#8-iconography--illustration). Headless Radix keeps focus trapping; Lucide is the 1.5 px icon set; date-fns counts business days for the date picker. |

## Open questions

| ID | Question | Owner | Needed by |
| --- | --- | --- | --- |
| Q-01 | ~~Which Airwallex entity/time zone is our sandbox account on?~~ **Resolved:** AWX US → `AIRWALLEX_ACCOUNT_TZ=America/Los_Angeles` (per Airwallex's *Funding and settlement models* table). Deadline math runs in this zone; the UI shows times in the viewer's local zone with the account zone in a tooltip. Confirm the entity in the sandbox web app during B2 | B | B1 |
| Q-02 | Are **Quotes** enabled on our sandbox account? **Answer:** assumed yes (Airwallex approved most products); the B2 smoke settles it through V4/V5 | B | B2 |
| Q-03 | ~~Home currency for the demo~~ **Resolved:** USD (`HOME_CURRENCY=USD`) | Product | Contracts |
| Q-04 | Brand constraints (exact Airwallex orange, logo) **Deferred:** build with the placeholder tokens in [05](./05-design-system.md) and a text wordmark, no Airwallex logo. Swapping in the real brand later only touches `tokens.css` and the wordmark component | Design | Before the demo |
| Q-05 | ~~Out-of-band alert channel~~ **Resolved:** none. Notifications are in-app only (toasts, `NotificationCenter`, SSE). The `Notifier` interface stays with just the `inapp` implementation | Product | B6 |
| Q-06 | ~~LLM provider for extraction~~ **Resolved:** Anthropic (Claude), see D-15 and [12](./12-bill-extraction.md). Real invoices are uploaded **only for testing**, under the standard Anthropic API terms; generated invoices are the default. Use the `ollama` adapter for anything sensitive | Eng lead | B4 |
| Q-07 | ~~Default auto-settle cutoff and lead days~~ **Resolved:** deadline window opens 09:00 and auto-settles at 14:00 in `America/Los_Angeles` (leaves ~10 h for re-quotes or a top-up before the Airwallex day ends). Lead days = the method's `flight_time.max` + 1 business day, falling back to LOCAL 1 / SWIFT 3 ([13 §5.3](./13-airwallex-contracts.md#53-method-lead-days-and-limits)). The demo runs on the warp clock, so these rarely show on stage | Product | B7 |
| Q-08 | ~~Hosting for the demo~~ **Resolved:** single server running web + worker + Redis in Docker Compose behind Caddy; MongoDB on **Atlas M0 (free)**, with its limits handled as in [10 §5](./10-deployment.md). Still open: VPS provider/region (pick the same region as the Atlas cluster) | Eng lead | B0 |
| Q-09 | Spend Bills sync (Beta): mirror each bill into Airwallex's accounts-payable module and mark it paid there, so bills also appear in the Airwallex web app. **Deferred / not planned:** not needed for the demo; `SPEND_SYNC` stays off | Product | After B9 |
| Q-10 | Results of verification checks V1–V17 ([01 §7](./01-feasibility-airwallex.md#7-verification-checklist-run-in-sandbox-during-b1b2)) | B | B2 |
| Q-11 | Which corridors the generator enables by default (depends on V12), and the beneficiary pool size per corridor | B | B2 |

## Sign-offs

| Gate | Date | Reviewers | Notes |
| --- | --- | --- | --- |
| Contracts frozen (v1) | | | |
| UI kit review (U5 exit) | | | Patterns U5.1–U5.7 are on `/dev/ui-kit` and the visual baseline includes them. Reviewer sign-off is still open. |
| Pages on mocks (U6 exit) | | | |
| Sandbox verification (B2 exit) | | | |
| Integrated demo rehearsal | | | |
