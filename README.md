# realtime-location-backend

Railway-ready backend for mobile realtime location apps (Strava / Life360 style).

## What you get

- **`api-server/`** — Hono on Bun
- **Better Auth** — email/password + bearer tokens for mobile
- **PostGIS** — activity tracks and GPS points
- **Redis** — auth secondary storage + live WebSocket fan-out
- **`.railway/railway.ts`** — Infrastructure as Code (not deprecated `railway.toml`)

Live docs once deployed: `/docs` (OpenAPI) and `/health`.

## Quick local start

```bash
# PostGIS + Redis required
docker run --name postgis -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=realtime_location \
  -p 5432:5432 -d postgis/postgis:16-3.4
# Redis on :6379

cd api-server
cp .env.example .env   # set DATABASE_URL, REDIS_URL, BETTER_AUTH_* , CORS_ORIGIN
bun install
bun run db:migrate
bun run dev
```

Human API walkthrough: [`api-server/README.md`](./api-server/README.md)  
Agent rules (conventions, edit map, Railway): [`AGENTS.md`](./AGENTS.md)

## Railway

Project config lives in [`.railway/railway.ts`](./.railway/railway.ts):

| Service | Purpose |
| --- | --- |
| `api-server` | Bun API (`preDeploy` runs migrations, health `/health`) |
| `PostGIS` | `postgis/postgis:16-3.4` + volume (managed Postgres has **no** PostGIS) |
| `Redis` | Sessions + realtime pub/sub |

```bash
# Preview / apply infra changes
railway link   # if needed
railway config plan
railway config apply

# Deploy API from this monorepo (rootDirectory api-server is in IaC when using GitHub)
# Or one-shot upload:
railway up ./api-server --path-as-root --service api-server --detach -m "ship api"
```

Do **not** add `railway.toml` / `railway.json` — deprecated, cutoff **2026-12-01**.

## Repo layout

```text
.
├── AGENTS.md              # for coding agents
├── README.md              # this file
├── .railway/railway.ts    # Railway IaC
├── package.json           # railway SDK only
└── api-server/            # the app
```
