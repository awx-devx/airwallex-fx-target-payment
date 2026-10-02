# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo.

## What this is

A **demo** of FX Target Payment on an **Airwallex sandbox** account. The user uploads foreign-currency bills, sets a target rate or max cost per bill, and submits. That submit authorizes payment. The system watches the rate until the execution deadline. When the target is hit, it locks a quote and pays. If the target is never hit, it **pays at the cutoff** under the standing instruction captured at submit. Every bill must be paid by its deadline, whatever happens. The UI is a dark perps-style trading terminal drawn as one matte ruled sheet: flat orange, square controls, a quiet grain pool along the bottom edge, and a glow only on the chart target line and a locked quote. Each bill is a position with its own chart showing entry and target lines, plus the deadline and due date lines. It is not production-ready by design.

Stack: Next.js (App Router, TypeScript strict), MongoDB 7 replica set + Mongoose, Redis 7 + BullMQ (queues) + Redis pub/sub (SSE fan-out), a separate worker process, Tailwind v4 + Radix + Motion, Lightweight Charts v5, TanStack Query + Zustand (UI state only), zod, decimal.js, date-fns-tz, Vitest, Playwright, pnpm.

We build **UI-first**: contracts and mocks (C0), then the UI kit on `/dev/ui-kit`, then a **review gate**, then pages on the mock `DataSource` (`NEXT_PUBLIC_DATA_SOURCE=mock`), then the backend and integration (see `docs/README.md`).

## Read before coding

| Need | Read |
| --- | --- |
| Overview, reading order, sequencing | `docs/README.md` |
| What Airwallex can and can't do, verified facts, V1–V17 checklist | `docs/01-feasibility-airwallex.md` |
| Airwallex fields, enums, statuses, error codes → our contracts and UI components | `docs/13-airwallex-contracts.md` |
| Topology, repo layout, boundaries, adapters, queues, Mongo/Redis conventions | `docs/02-architecture.md` |
| State machine, invariants, rate math, triggers, deadline rules, schemas, contracts, REST API | `docs/03-domain-model.md` |
| Every Airwallex endpoint, `request_id`s, status mapping, webhooks | `docs/04-airwallex-integration.md` |
| Tokens, glow, typography, motion, chart styling | `docs/05-design-system.md` |
| UI kit inventory and `/dev/ui-kit` review gate | `docs/06-ui-kit-spec.md` |
| Terminal layout, ticket per state, flows, edge states | `docs/07-pages-spec.md` |
| Demo mode, warp clock, simulator, scenarios, demo-vs-production inventory | `docs/08-demo-plan.md` |
| Decisions (D-xx) and open questions (Q-xx) | `docs/09-decisions-and-open-questions.md` |
| Hosting, Compose, Caddy, deploy, singleton worker | `docs/10-deployment.md` |
| Test data generator, seeding profiles, extraction accuracy | `docs/11-test-data-and-seeding.md` |
| Bill extraction pipeline (XML/QR readers, Claude, validators, review confidence) | `docs/12-bill-extraction.md` |
| Task IDs and exit criteria | `docs/tracks/U-track.md`, `docs/tracks/B-track.md` |

Focused rules live in `.cursor/rules/*.mdc`.

## Hard rules

1. **Airwallex is server-side only.** Only `src/server/**` and `src/worker/**` talk to Airwallex, and only through `src/server/adapters/airwallex/client.ts`. Never expose keys or tokens to the browser.
2. **No JS numbers for money or rates.** Use `decimal.js` in code, `Decimal128` in Mongo, and decimal strings in contracts. Airwallex takes decimal **major units** rounded to the currency precision in `src/contracts/currencies.ts`.
3. **Canonical price** `p = sell_amount / buy_amount` from the `CLIENT` rate level (H per F). Never read `rate`/`client_rate` directly. Lower `p` is better; direction colours go through `favorable()`.
4. **Every bill state change goes through `transition()`** and one conditional `findOneAndUpdate` on `state ∈ allowedFrom` and `version`. Multi-document transactions are allowed only for execution-create.
5. **Deterministic idempotency everywhere.** Airwallex `request_id`s (`tr:{billId}:{attempt}`) and BullMQ `jobId`s come from shared builders. `attempt` increments only after a terminal failure.
6. **Time comes from the injected `Clock`.** No `Date.now()`/`new Date()` in domain, services or the worker. Timers are Mongo fields picked up by the sweeper, not BullMQ delayed jobs.
7. **The deadline wins.** Nothing (pause, a failed quote, a restart) may stop an armed bill from being paid by its execution deadline. The deadline overrides every non-terminal state.
8. **Nothing is paid without consent.** Consent is the standing instruction captured at submit. A payment then executes on a still-valid quote, when the target is hit or at the cutoff. The demo Simulate run (`docs/08` §1.1) uses that same path and exists only in `DEMO_MODE`.
9. **Webhooks + the reconciler are the source of truth for transfer status.** Updates are monotonic (status rank) and idempotent.
10. **`src/ui/**` is props-only.** No fetching, no stores, no imports from `server/`, `features/` or data libraries.
11. **The poller and the sweeper run exactly once** (Redis leader lock). BullMQ processors may run anywhere.
12. **Don't invent Airwallex endpoints or fields.** Check `docs/04`, then https://www.airwallex.com/docs/llms.txt. Unverified behaviour goes into `docs/01` §7 or `docs/09` as a Q-xx.

## Comment tags (required)

Tag shortcuts where they live, and keep the inventory in `docs/08-demo-plan.md` §5 in sync:

- `DEMO-ONLY:` unsafe or incorrect in production, always followed by `PROD:` with the real approach
- `SANDBOX:` relies on sandbox-only Airwallex behaviour (simulation endpoints, simulated pricing, pre-funded wallet)
- `AIRWALLEX:` non-obvious API constraint, with a docs link

Audit with `rg -n "DEMO-ONLY:|SANDBOX:" src scripts`.

## Commits

**Ask the user before every commit** (show the message and files) unless they have explicitly said to keep committing without asking in the current conversation. Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Commit **small and often**, one logical unit per commit, and each commit should typecheck so it can be reverted cleanly. Update docs in the same commit as the behaviour they describe, and reference track IDs (`Refs: U4.2`). Format: `type(scope): summary`. Scopes and examples are in `.cursor/rules/git-commits.mdc`. Never commit secrets or `.env*` (except `.env.example`). Don't push unless asked.

## Commands (once scaffolded)

```bash
pnpm infra:up             # MongoDB (rs0) + Redis via docker compose
pnpm dev                  # Next.js dev server
pnpm worker               # worker: BullMQ processors + poller + sweeper
pnpm db:indexes           # sync Mongoose indexes / time-series collections
pnpm seed:beneficiaries   # sandbox beneficiaries
pnpm seed:demo            # 3 curated demo bills from demo/invoices/
pnpm seed:generate        # seeded random vendors/beneficiaries/invoices/bills (--profile mixed|lifecycle|deadline|corridors|upload|stress|e2e --seed N)
pnpm gen:invoices         # invoice files + truth.json only (--profile extraction)
pnpm seed:reset --generated
pnpm test:extraction      # extractor accuracy against generated truth
pnpm airwallex:smoke      # V1–V10, V12–V17 sandbox checks; records mapper fixtures
pnpm test                 # Vitest
pnpm test:visual          # Playwright screenshots of /dev/ui-kit
pnpm typecheck && pnpm lint
```
