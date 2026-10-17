# askdesk-core

The core control-plane microservice for AskDesk. Responsible for user authentication, session/token management, organization multi-tenancy, RBAC guards, audit trails, and billing integrations.

---

## 🚀 Features & Architecture

- **Fastify HTTP Framework**: Lightweight, schema-driven serialization and high throughput.
- **Strict TypeScript**: `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `NodeNext` modules.
- **Zod Environment Loader**: Fail-fast validation with informative errors before server boot.
- **Vitest Testing Suite**: Blazing fast in-memory integration and unit tests using `app.inject()`.
- **Zero-Docker Local First**: Runs natively on Node.js + local MongoDB.

---

## 🏃 Running Locally

```bash
# Start development server with live reload (tsx)
pnpm dev

# Build production TypeScript into dist/
pnpm build

# Start production build
pnpm start
```

---

## 🧪 Testing

```bash
# Run Vitest test suite
pnpm test

# Run tests with V8 coverage report
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

### Manual Testing

Start the server with `pnpm dev`, then hit the health route:

```bash
curl http://127.0.0.1:4000/health
```

Expected Response:

```json
{
  "status": "ok",
  "service": "askdesk-core",
  "uptime": 2.14,
  "timestamp": "2026-10-17T05:22:00.000Z"
}
```

#### Test User Registration (`POST /auth/register`)

```bash
curl -X POST http://127.0.0.1:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "alex@example.com", "password": "SecureP@ssword123!", "name": "Alex"}'
```

Expected Response (`201 Created`):

```json
{
  "message": "User registered successfully",
  "user": {
    "id": "67b095...",
    "email": "alex@example.com",
    "name": "Alex",
    "createdAt": "2026-10-17T05:35:00.000Z"
  }
}
```

Repeat the same command to verify duplicate email protection (`409 Conflict`):

```json
{
  "error": "Conflict",
  "message": "An account with this email address already exists"
}
```

---

## 🛡 Quality Checks

```bash
# TypeScript compilation check without emitting files
pnpm typecheck

# ESLint analysis
pnpm lint
pnpm lint:fix
```

---

## 🛣 Route Manifest (Phase 1)

| Method   | Path                             | Auth    | Description                                               | Status                  |
| -------- | -------------------------------- | ------- | --------------------------------------------------------- | ----------------------- |
| `GET`    | `/health`                        | Public  | Service health & uptime probe                             | ✅ Implemented (Day 1)  |
| `POST`   | `/auth/register`                 | Public  | User registration with argon2 hash                        | ✅ Implemented (Day 2)  |
| `POST`   | `/auth/login`                    | Public  | Issue 15m access token & refresh cookie (rate-limited)    | ✅ Implemented (Day 3)  |
| `POST`   | `/auth/refresh`                  | Cookie  | Single-use refresh rotation & reuse detection             | ✅ Implemented (Day 4)  |
| `POST`   | `/auth/logout`                   | Cookie  | Revoke token family and clear session                     | ✅ Implemented (Day 4)  |
| `POST`   | `/orgs`                          | JWT     | Create tenant organization & set owner                    | ✅ Implemented (Day 5)  |
| `GET`    | `/orgs`                          | JWT     | List caller organizations                                 | ✅ Implemented (Day 5)  |
| `GET`    | `/orgs/:orgId`                   | RBAC    | Load tenant context with membership check                 | ✅ Implemented (Day 5)  |
| `POST`   | `/orgs/:orgId/invites`           | RBAC    | Create invite with single-use hashed token                | ✅ Implemented (Day 6)  |
| `POST`   | `/orgs/:orgId/invites/accept`    | JWT     | Accept invite & join organization with assigned role      | ✅ Implemented (Day 7)  |
| `GET`    | `/orgs/:orgId/members`           | RBAC    | List members with roles                                   | ✅ Implemented (Day 7)  |
| `PATCH`  | `/orgs/:orgId/members/:memberId` | RBAC    | Change role (enforces last owner protection)              | ✅ Implemented (Day 7)  |
| `DELETE` | `/orgs/:orgId/members/:memberId` | RBAC    | Remove member (enforces last owner protection)            | ✅ Implemented (Day 7)  |
| `GET`    | `/orgs/:orgId/audit`             | RBAC    | Append-only audit trail logs with pagination & filters    | ✅ Implemented (Day 8)  |
| `POST`   | `/orgs/:orgId/billing/checkout`  | RBAC    | Create Stripe checkout session for Pro/Enterprise plans   | ✅ Implemented (Day 9)  |
| `POST`   | `/orgs/:orgId/billing/portal`    | RBAC    | Create Stripe customer billing portal session             | ✅ Implemented (Day 9)  |
| `POST`   | `/webhooks/stripe`               | Webhook | Stripe signature verification & idempotent event handling | ✅ Implemented (Day 10) |
| `POST`   | `/orgs/:orgId/api-keys`          | RBAC    | Create API key (revealed once, stored as hash+prefix)     | ✅ Implemented (Day 10) |
| `GET`    | `/orgs/:orgId/api-keys`          | RBAC    | List active API keys (masked)                             | ✅ Implemented (Day 10) |
| `DELETE` | `/orgs/:orgId/api-keys/:keyId`   | RBAC    | Revoke API key                                            | ✅ Implemented (Day 10) |
