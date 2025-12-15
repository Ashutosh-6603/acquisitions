# Acquisitions API — Architecture Notes (updated 2025-12-15)

## 1) Big Picture
**What it is:** A Node.js (ESM) + Express REST API.

**What it does:**
- Provides basic health/info endpoints.
- Implements authentication (sign-up, sign-in, sign-out) using **JWT** stored in an **HTTP-only cookie**.
- Implements a **Users** module intended for authenticated CRUD (fetch/update/delete users), with role-based access control (admin vs user).
- Persists data to **PostgreSQL** (typically Neon / Neon Local) via **Drizzle ORM**.
- Adds request security controls using **Arcjet** (shield + bot detection + rate limiting).

## 2) Core Architecture
This is a **single-service modular monolith** with a mostly-layered structure:

- **HTTP layer (Express)**
  - `src/app.js` wires middleware and routes.
  - `src/routes/*` defines endpoint-to-controller mapping.
- **Controller layer**
  - `src/controllers/*` performs request validation and shapes HTTP responses.
- **Service layer**
  - `src/services/*` contains business logic and database interactions.
- **Data access / schema layer**
  - `src/models/*` defines Drizzle table schemas.
  - `drizzle/` contains migrations.
- **Cross-cutting utilities**
  - `src/config/*` for infra (DB, logger, Arcjet).
  - `src/utils/*` for JWT, cookies, validation formatting.
  - `src/middleware/*` for request security (and intended auth).

### High-level module map
```text
src/index.js
  -> loads dotenv
  -> imports src/server.js

src/server.js
  -> app.listen(PORT)

src/app.js
  -> express + middleware stack
  -> routes: /api/auth, /api/users
```

## 3) Key Components (by folder/module)

### Bootstrapping
- `src/index.js`: loads environment variables via `dotenv/config` and starts the server.
- `src/server.js`: starts the HTTP listener.
- `src/app.js`: creates the Express app, configures middleware, and mounts routers.

### Routes
- `src/routes/auth.routes.js`
  - `POST /api/auth/sign-up`
  - `POST /api/auth/sign-in`
  - `POST /api/auth/sign-out`
- `src/routes/users.routes.js`
  - `GET /api/users/` (intended: authenticated; comment says “admin only”)
  - `GET /api/users/:id` (intended: authenticated)
  - `PUT /api/users/:id` (intended: authenticated; user can update self, admin can update anyone)
  - `DELETE /api/users/:id` (intended: authenticated + admin)

### Controllers
- `src/controllers/auth.controller.js`
  - Validates request bodies using Zod schemas.
  - Calls auth services.
  - Issues JWTs and sets/clears the `token` cookie.
- `src/controllers/users.controller.js`
  - Validates `:id` and update payloads (intended via `#validations/users.validation.js`).
  - Performs authorization checks using `req.user` (role + id).
  - Delegates DB operations to `src/services/users.service.js`.

### Services
- `src/services/auth.service.js`
  - Hashes and compares passwords using `bcrypt`.
  - Creates users and authenticates credentials against the DB.
- `src/services/users.service.js`
  - Implements select/update/delete operations against the `users` table via Drizzle.

### Database + ORM
- `src/config/database.js`
  - Uses `@neondatabase/serverless` with Drizzle’s `neon-http` driver.
  - In development, configures Neon Local fetch endpoint.
- `src/models/user.model.js`
  - Defines `users` table: `id`, `name`, `email` (unique), `password` (hash), `role`, `created_at`, `updated_at`.
- `drizzle.config.js` and `drizzle/`
  - Drizzle schema points at `src/models/*.js`.
  - Migrations live in `drizzle/*.sql`.

### Security & Middleware
- `src/config/arcjet.js`
  - Global Arcjet rules: shield, bot detection, and a sliding window rate-limit.
- `src/middleware/security.middleware.js`
  - Applies additional role-based rate limiting (guest/user/admin) using Arcjet.
  - Uses `req.user?.role` if present; otherwise treats requests as `guest`.

### Utilities
- `src/utils/jwt.js`: wrapper around `jsonwebtoken` for sign/verify.
- `src/utils/cookies.js`: cookie helpers with secure defaults.
- `src/utils/format.js`: transforms Zod errors into a client-friendly format.

## 4) Data Flow & Communication
Everything happens in-process (no microservices/message bus). Communication is:
- **HTTP (client → Express)**
- **In-memory calls (router → controller → service)**
- **DB calls (service → Drizzle → PostgreSQL/Neon)**

### Request pipeline (current)
```text
Client
  -> Express (helmet, cors, json/urlencoded, cookie-parser)
  -> Morgan access logs -> Winston logger
  -> securityMiddleware (Arcjet shield/bot/rate limit)
  -> Router (/api/auth or /api/users)
  -> Controller (Zod validation, authZ checks)
  -> Service (business logic + DB)
  -> Response
```

## 5) Tech Stack & Dependencies
From `package.json`:
- Runtime / platform: **Node.js**, **ESM** (`"type": "module"`)
- Web framework: **Express**
- Security: **helmet**, **cors**, **Arcjet** (`@arcjet/node`, `@arcjet/inspect`)
- Auth & crypto: **jsonwebtoken**, **bcrypt**
- Validation: **zod**
- Logging: **morgan** (HTTP access) + **winston** (structured logs)
- DB/ORM: **PostgreSQL** via **Neon serverless driver** + **Drizzle ORM**
- Tooling: **drizzle-kit**, **eslint**, **prettier**

Notable detail: the project uses Node import aliases (e.g. `#routes/*`, `#services/*`).

## 6) Execution Flow (example workflows)

### A) Sign-up (`POST /api/auth/sign-up`)
1. Request hits `src/app.js` middleware stack.
2. `src/routes/auth.routes.js` routes to `signup`.
3. `src/controllers/auth.controller.js:signup`
   - Validates payload via `signupSchema`.
   - Calls `createUser`.
4. `src/services/auth.service.js:createUser`
   - Checks if email exists.
   - Hashes password (`bcrypt.hash`).
   - Inserts the user into the `users` table.
5. Controller signs a JWT (`jwttoken.sign({id, email, role})`).
6. Sets `token` cookie (`cookies.set`).
7. Returns `201` with user fields (no password).

### B) Sign-in (`POST /api/auth/sign-in`)
1. Controller validates input with `signinSchema`.
2. Service loads the user by email.
3. Service verifies password with `bcrypt.compare`.
4. Controller sets `token` cookie and returns user info.

### C) Fetch a user (`GET /api/users/:id`)
Intended flow:
1. Auth middleware should authenticate the request, set `req.user`, and call `next()`.
2. Users controller validates `:id`.
3. Users service loads the row via Drizzle.
4. Returns the user profile.

## 7) Strengths & Tradeoffs

### Strengths
- Clean, recognizable layering (routes → controllers → services → DB) that scales well for more endpoints.
- Zod-based request validation keeps controllers explicit and safer.
- Drizzle schema + migrations provide a clear DB contract.
- Arcjet provides a strong baseline for bot detection and common attack protection.

### Tradeoffs / Things to watch
- **Missing modules referenced by imports (currently breaks startup):**
  - `src/routes/users.routes.js` imports `#middleware/auth.middleware.js`, but only `security.middleware.js` exists.
  - `src/controllers/users.controller.js` imports `#validations/users.validation.js`, but it does not exist.
- **No centralized error handler:** controllers call `next(e)`, but `src/app.js` does not register an error-handling middleware (so errors may be unhandled/returned inconsistently).
- **Auth error contract mismatch:**
  - `authenticateUser()` throws `"Invalid Password"`, but the controller only maps `"Invalid credentials"` to a 401. Result: invalid password may become a 500 unless handled elsewhere.
- **Validation formatting bug:** `formatValidationError()` calls `i.message.join(',')` even though Zod issue `message` is a string; this can throw during error formatting.
- **Winston logger format bug:** `src/config/logger.js` uses the comma operator inside `format.combine(...)`, which prevents the intended timestamp/error formatting from being applied.
- **Security layering:** Arcjet is configured globally in `src/config/arcjet.js` *and* `security.middleware.js` adds another per-role limiter, which may be redundant.
- **Security defaults:**
  - `cors()` is open by default.
  - `JWT_SECRET` has a production-unsafe fallback string.
  - Cookie lifetime (`maxAge` 15 minutes) and JWT lifetime (`1d`) are not aligned; there’s no refresh-token flow.

## 8) Final Summary (2–3 sentences)
Acquisitions is a Node/Express REST API built as a modular monolith using a routes → controllers → services → Drizzle(Postgres) architecture. It supports cookie-based JWT authentication and a Users module, and it uses Arcjet plus common Express middleware for security and observability. The current codebase has a few integration gaps (missing auth/users validation modules and missing global error handling) that should be fixed to make the Users routes fully functional.
