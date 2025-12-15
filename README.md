# acquisitions — Docker + Neon (dev/prod)

This repo runs an Express app that talks to Postgres via Neon.

## Environments

### Development (local) — Neon Local (Docker)

Development uses **Neon Local** (a local proxy container) to:

- expose a local Postgres endpoint at `neon-local:5432`
- automatically create an **ephemeral Neon branch** on container startup (when `PARENT_BRANCH_ID` is set)
- delete that branch on container shutdown (default behavior)

Your app connects to Neon Local via:

- `DATABASE_URL=postgres://neon:npg@neon-local:5432/dbname?sslmode=require`

Because this app uses `@neondatabase/serverless`, it also needs the fetch endpoint:

- `NEON_FETCH_ENDPOINT=http://neon-local:5432/sql`

#### 1) Configure dev env

Create `.env.development` (already present in this workspace; fill in the blanks):

- `NEON_API_KEY`
- `NEON_PROJECT_ID`
- `PARENT_BRANCH_ID` (the parent branch to clone for ephemeral branches)

#### 2) Start dev stack

```bash
docker compose -f docker-compose.dev.yml up --build
```

App will be on `http://localhost:3000`.

### Production — Neon Cloud

Production uses the real **Neon Cloud** connection string (e.g. `...neon.tech...`). Neon is a managed service, so there is no local database container in production compose; only the app container runs and connects out to Neon.

- No Neon Local proxy is used in production.
- Secrets/URLs must be injected via environment variables (or `.env.production` locally).

#### Configure prod env

Edit `.env.production` and set:

- `DATABASE_URL=postgres://...neon.tech...`

#### Start prod (local simulation)

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

#### Run migrations (optional)

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
```

## How DATABASE_URL switches between dev and prod

- Dev (`docker-compose.dev.yml`) loads `.env.development` where `DATABASE_URL` points to `neon-local:5432`.
- Prod (`docker-compose.prod.yml`) loads `.env.production` where `DATABASE_URL` points to Neon Cloud (`*.neon.tech`).

## Notes

- Neon Local requires `NEON_API_KEY` and `NEON_PROJECT_ID` to manage branches.
- Ephemeral branches are created when `PARENT_BRANCH_ID` is set.
