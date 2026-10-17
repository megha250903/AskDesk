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

| Method | Path                | Auth   | Description                             | Status                 |
| ------ | ------------------- | ------ | --------------------------------------- | ---------------------- |
| `GET`  | `/health`           | Public | Service health & uptime probe           | ✅ Implemented (Day 1) |
| `POST` | `/auth/register`    | Public | User registration with argon2 hash      | ✅ Implemented (Day 2) |
| `POST` | `/auth/login`       | Public | Issue 15m access token & refresh cookie | ⏳ Day 3               |
| `POST` | `/auth/refresh`     | Cookie | Refresh rotation with reuse detection   | ⏳ Day 4               |
| `POST` | `/auth/logout`      | Cookie | Invalidate refresh family               | ⏳ Day 4               |
| `POST` | `/orgs`             | JWT    | Create tenant organization & set owner  | ⏳ Day 5               |
| `GET`  | `/orgs/:id/members` | RBAC   | Member list with role checks            | ⏳ Day 7               |
| `GET`  | `/orgs/:id/audit`   | RBAC   | Append-only audit trail logs            | ⏳ Day 8               |
