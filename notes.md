# Acquisitions API — Architecture Notes

## 1) Big Picture
- **Project type:** Node.js (ESM) + Express API
- **Purpose:** Backend API for an “Acquisitions” system; currently includes health endpoints and an authentication module with sign-up implemented.

## 2) Core Architecture
- **Style:** Single-service monolith with a layered / MVC-ish structure.
- **Layers:**
  - **Routes** map endpoints to controllers
  - **Controllers** handle HTTP concerns (validation, status codes, cookies)
  - **Services** implement business logic and DB interaction
  - **Models** define DB schema (Drizzle)
  - **Config/Utils** provide cross-cutting concerns (db, logging, jwt, cookies)

## 3) Major Modules / Files

### Bootstrapping
- `src/index.js`
  - Loads environment (`dotenv/config`) and imports `src/server.js`.
- `src/server.js`
  - Starts listening on `PORT` and binds the Express app.
- `src/app.js`
  - Express app setup: middleware stack + route mounting.

### Routing
- `src/routes/auth.routes.js`
  - `POST /api/auth/sign-up` → `signup` controller (implemented)
  - `POST /api/auth/sign-in` → placeholder
  - `POST /api/auth/sign-out` → placeholder

### Controllers
- `src/controllers/auth.controller.js`
  - Validates request body using Zod
  - Calls the auth service to create users
  - Signs a JWT and stores it in a cookie
  - Returns a 201 with a sanitized user payload

### Services
- `src/services/auth.service.js`
  - Password hashing via bcrypt
  - Creates users via Drizzle ORM

### Database
- `src/config/database.js`
  - Neon serverless Postgres driver + Drizzle client
- `src/models/user.model.js`
  - Drizzle schema for `users`
- `drizzle/`
  - Generated migrations and metadata (e.g. initial `users` table)

### Utilities / Cross-cutting
- `src/config/logger.js` (winston)
- `src/utils/jwt.js` (jsonwebtoken wrapper)
- `src/utils/cookies.js` (cookie helpers)
- `src/utils/format.js` (validation error formatting)
- `src/validations/auth.validation.js` (zod schemas)

## 4) Data Flow & Communication
Typical HTTP request flow:

```text
Client
  -> Express middleware (helmet/cors/body parsing/cookies/morgan)
    -> Route (src/routes/*)
      -> Controller (src/controllers/*)
        -> Service (src/services/*)
          -> DB (Drizzle + Neon driver)
        <- Controller (cookie + JSON response)
  <- Response
```

Logging flow:
- HTTP access logs via `morgan('combined')`
- Morgan writes into Winston (`logger.info(...)`)
- Winston writes to `logs/combined.log`, `logs/error.log` (+ console in non-prod)

## 5) Tech Stack & Dependencies
- Runtime: **Node.js** (ES modules via `"type": "module"`)
- Web: **Express**, **helmet**, **cors**, **cookie-parser**, **morgan**
- Validation: **zod**
- Auth/security: **bcrypt**, **jsonwebtoken**
- DB: **PostgreSQL** with **Drizzle ORM** + **drizzle-kit**, using **Neon serverless** driver (`@neondatabase/serverless`)
- Tooling: ESLint + Prettier

## 6) Example Execution Flow — `POST /api/auth/sign-up`
1. Request enters Express app (`src/app.js`)
2. Middleware runs (helmet/cors/json/urlencoded/cookie-parser/morgan)
3. Route match: `/api/auth/sign-up` → `signup`
4. Controller validates input with `signupSchema.safeParse`
5. Service hashes password and inserts user via Drizzle
6. Controller signs JWT and sets cookie `token`
7. Responds with `201` and user payload (without password)

## 7) Strengths
- Clear separation of concerns (routes/controllers/services/models)
- Solid baseline middleware stack (security headers, request logging)
- Schema + migrations in place via Drizzle
- Request validation at boundaries via Zod

## 8) Issues / Tradeoffs / Watch-outs (based on current code)

### Missing centralized error handling
- Controllers call `next(error)` in places, but `src/app.js` does not define a global error-handling middleware to format errors consistently.

### `createUser` existing-user check likely broken
In `src/services/auth.service.js`:
- The `select()` query is not `await`ed.
- `.from('users')` uses a string; typically Drizzle uses `.from(users)`.
- As written, `existingUser.length` is unlikely to behave correctly.

### Error message mismatch between controller and service
- Controller checks: `error.message === 'User with this email already exists'`
- Service throws: `new Error('User already exists')`
- Result: conflict errors likely won’t map to the intended `409` response.

### Cookie option typo
In `src/utils/cookies.js`:
- `maxAfge` should be `maxAge`, so cookie expiration likely isn’t applied.

### Logger format bug
In `src/config/logger.js`:
- `format.combine((winston.format.timestamp(), winston.format.errors(...), winston.format.json()))` uses the comma operator, so timestamp/error formatting are effectively dropped and only the last formatter may apply.

### Security defaults to review
- `src/utils/jwt.js` uses a fallback `JWT_SECRET` value; production should require a real secret.
- `cors()` is currently default/open; consider restricting origins.
- Cookie approach is present, but evaluate CSRF protection depending on how the cookie is used.

