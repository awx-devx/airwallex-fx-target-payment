# <img src="public/logomark.png" alt="" width="28" height="28" style="width: 28px; height: 28px; vertical-align: middle;"> FX Target Payment

<p>
  <a href="https://nextjs.org/"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white"></a>
  <a href="https://mongoosejs.com/"><img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white"></a>
  <a href="https://redis.io/"><img alt="Redis" src="https://img.shields.io/badge/Redis-BullMQ-FF4438?logo=redis&logoColor=white"></a>
  <a href="https://tailwindcss.com/"><img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white"></a>
  <a href="https://www.airwallex.com/docs"><img alt="Airwallex sandbox" src="https://img.shields.io/badge/Airwallex-sandbox-6C47FF?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iNTc4IiBoZWlnaHQ9IjM4NSIgdmlld0JveD0iMCAwIDU3OCAzODUiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI%2BCjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNTU1LjgwNyAxNTEuMjg3QzU2NS43OTUgMTYxLjAwOSA1NzIuNzIzIDE3My40MzkgNTc1LjczOCAxODcuMDQ3QzU3OC43NTQgMjAwLjY1NiA1NzcuNzI1IDIxNC44NDggNTcyLjc3OSAyMjcuODhMNTM1LjA5MyAzMzAuMjZDNTI1LjIwMiAzNTcuMTQgNTAyLjY1OCAzNzcuOTM0IDQ3NC43OTkgMzgzLjM2MUM0NjAuODYzIDM4Ni4xNSA0NDYuNDMyIDM4NS4wOTkgNDMzLjA0OCAzODAuMzE5QzQxOS42NjUgMzc1LjUzOSA0MDcuODMyIDM2Ny4yMSAzOTguODE2IDM1Ni4yMjRMMTcyLjgyOCA4NS40Njg5QzE3Mi4yNjYgODQuODAyNiAxNzEuNTM5IDg0LjI5NTUgMTcwLjcyIDgzLjk5ODNDMTY5LjkwMSA4My43MDExIDE2OS4wMTggODMuNjI0MyAxNjguMTU5IDgzLjc3NTVDMTY3LjMwMSA4My45MjY3IDE2Ni40OTcgODQuMzAwNiAxNjUuODI5IDg0Ljg1OThDMTY1LjE2IDg1LjQxOTEgMTY0LjY1IDg2LjE0NDEgMTY0LjM1IDg2Ljk2MjJMOTAuODI0MiAyODUuODNDODkuMjk4OCAyODkuOTQxIDkzLjM0NTIgMjkzLjkyMyA5Ny4zNTk1IDI5Mi4yODVMMTg3LjU4NSAyNTUuNDM0QzE5Mi42NzEgMjUzLjM3MiAxOTguMTI5IDI1Mi4zODMgMjAzLjYxNiAyNTIuNTNDMjA5LjEwMyAyNTIuNjc2IDIxNC41IDI1My45NTUgMjE5LjQ2OSAyNTYuMjg2QzIyNC40MzggMjU4LjYxNyAyMjguODcyIDI2MS45NDkgMjMyLjQ5MyAyNjYuMDc0QzIzNi4xMTMgMjcwLjIgMjM4Ljg0MiAyNzUuMDI4IDI0MC41MDkgMjgwLjI1OEMyNDcuMTczIDMwMC42OTkgMjM1Ljk2NSAzMjIuNzc3IDIxNi4yMyAzMzAuODM4TDk4LjM3MSAzNzguOTYxQzc2LjU0OTQgMzg3Ljg3MyA1MS40ODQyIDM4Ni4zIDMxLjgzMDIgMzczLjE4MUMxOC40MzY3IDM2NC4yMyA4LjQ1MTE5IDM1MS4wMjYgMy40ODY1NiAzMzUuNzAxQy0xLjQ3ODA2IDMyMC4zNzYgLTEuMTMyIDMwMy44MjQgNC40Njg4NyAyODguNzJMOTEuMzM4IDUzLjgzNjRDMTAxLjYzMSAyNS45OTMzIDEyNS4wNzQgNi4zMzkzMyAxNTQuMDU3IDEuMjY1MjdDMTY4LjE3MiAtMS4yNjQxMSAxODIuNzA1IDAuMDEzNDc2NiAxOTYuMTYxIDQuOTY2NTRDMjA5LjYxOCA5LjkxOTU5IDIyMS41MTEgMTguMzY5MiAyMzAuNjE4IDI5LjQ0NTZMMzYwLjMyNyAxODQuODc5TDQ3OS42MzIgMTM2LjE0NUM1MDYuMTQyIDEyNS4zMjMgNTM1LjMzNCAxMzEuMTE5IDU1NS44MDcgMTUxLjI4N1pNNDg3LjAwMiAyMjkuMzU3QzQ4OC41MTEgMjI1LjI0NiA0ODQuNDY1IDIyMS4yNjQgNDgwLjQ1MSAyMjIuOTE4TDQxNC41MzYgMjQ5LjgzTDQ1NC4wNjkgMjk3LjIxNEM0NTQuNjMgMjk3Ljg4OSA0NTUuMzU4IDI5OC40MDMgNDU2LjE4MiAyOTguNzA1QzQ1Ny4wMDUgMjk5LjAwNyA0NTcuODkzIDI5OS4wODcgNDU4Ljc1NyAyOTguOTM1QzQ1OS42MjEgMjk4Ljc4NCA0NjAuNDI5IDI5OC40MDcgNDYxLjEgMjk3Ljg0MkM0NjEuNzcyIDI5Ny4yNzggNDYyLjI4MiAyOTYuNTQ2IDQ2Mi41NzkgMjk1LjcyMUw0ODYuOTg2IDIyOS4zNTdINDg3LjAwMloiIGZpbGw9IndoaXRlIi8%2BCjwvc3ZnPgo%3D&logoColor=white"></a>
</p>

## What this is

Upload a foreign-currency bill, set a target rate or a maximum cost, and submit. That submit authorizes payment. The system watches the rate. When the target is hit, it locks a quote and pays. If the target is never hit, it pays at the cutoff under the standing instruction captured at submit. Every armed bill is paid by its deadline.

Rates and quotes are Airwallex Transactional FX. The payment is an Airwallex payout with conversion. Everything runs on one Airwallex **sandbox** account. This is a demo, not a production system: shortcuts are tagged in code and listed in [docs/08-demo-plan.md](docs/08-demo-plan.md). The product brief is [docs/00-product-brief.md](docs/00-product-brief.md).

## Stack

Next.js App Router, MongoDB via Mongoose, Redis and BullMQ, a worker process, Tailwind CSS. Airwallex is called from the server only.

## Deploy on Replit

Replit imports this repo and publishes one container. That container runs Next.js, the worker, and Redis. MongoDB stays on Atlas. The same steps, and why this host cannot scale out, are in [docs/10-deployment.md](docs/10-deployment.md) §12.

1. Create a MongoDB Atlas cluster (M0 is enough). It must be a replica set, which Atlas is. Allow Replit’s egress (`0.0.0.0/0` is the usual sandbox choice) and copy `MONGODB_URI`. On M0 set `RATE_TICKS_TTL_DAYS=7`.
2. Import the repo: [replit.com/github/awx-devx/airwallex-fx-target-payment](https://replit.com/github/awx-devx/airwallex-fx-target-payment).
3. Set secrets in **both** the workspace Secrets tool and the deployment’s Secrets. Workspace secrets are not copied into a deployment. `NEXT_PUBLIC_*` must be present at build time.
4. For a real demo set `NEXT_PUBLIC_DATA_SOURCE=api`, `DEMO_MODE=true`, `CLOCK=warp`, `MONGODB_URI`, and the Airwallex keys from [`.env.example`](.env.example): `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY`, `AIRWALLEX_WEBHOOK_SECRET`. Leave `REDIS_URL` unset so the container starts Redis itself. Set `AIRWALLEX_GLOBAL_ACCOUNT_ID` if the demo tops up the wallet. Set `ANTHROPIC_API_KEY`, or set `BILL_EXTRACTOR=mock` to skip live extraction. The rest can stay at the `.env.example` defaults.
5. Publish as a **Reserved VM** with **one instance**. Autoscale (the `.replit` file default) can scale to zero and stop the worker, so nothing watches the rate or pays at the cutoff. More than one instance is worse: each container has its own Redis, so two workers can pay the same bill. Do not change the instance count.
6. In the Airwallex sandbox, set the webhook URL to `https://<slug>.replit.app/api/webhooks/airwallex`. Use the published host, not the `*.replit.dev` editor URL. The API version must equal `AIRWALLEX_API_VERSION`.
7. Seed from your machine, not inside Replit. Point `.env` at the same Atlas URI and the same Airwallex keys, then run `pnpm seed:beneficiaries` and `pnpm seed:demo`.

`pnpm replit:dev` is what the editor Run button executes. With `MONGODB_URI` set it starts Redis, syncs indexes, and starts the worker next to `next dev`. Without it, only Next.js starts.

## Run locally

Node 22 or newer, pnpm 10. The UI can run on in-browser mocks (`NEXT_PUBLIC_DATA_SOURCE=mock`) with no MongoDB and no Airwallex keys. A real demo needs MongoDB (a replica set), Redis, and the worker.

```bash
cp .env.example .env         # fill in Mongo, Redis, and Airwallex for a real demo
pnpm install
# MongoDB replica set (rs0) and Redis already running — see docs/02 §9.5
pnpm db:indexes
pnpm dev                     # http://localhost:3000
pnpm worker                  # second terminal
```

The rest of the docs — domain model, Airwallex calls, UI — start at [docs/README.md](docs/README.md).
