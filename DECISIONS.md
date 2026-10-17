# Architecture & Technical Decisions (DECISIONS.md)

This log records major technical, architectural, and design choices made during development.

## Log

- **2026-10-17 (Day 1)**: Chosen pnpm monorepo structure with `apps/` and `packages/` to support multi-service architecture (`askdesk-core`, `askdesk-gateway`, `askdesk-chat`, `promptproof`) while sharing TypeScript and linting configs.
- **2026-10-17 (Day 1)**: Selected Fastify for `askdesk-core` due to high throughput, built-in schema validation, and lightweight lifecycle hooks.
- **2026-10-17 (Day 1)**: Configured Zod for runtime environment validation with fail-fast startup behavior on missing or invalid variables.
- **2026-10-17 (Day 1)**: Development workflow is configured for 100% native local execution (Node.js + pnpm) without requiring Docker locally.
- **2026-10-17 (Day 2)**: Selected Argon2id over bcrypt for password hashing with OWASP-recommended parameters (64 MB memory cost, 3 iterations) for superior GPU/ASIC brute-force resistance.
- **2026-10-17 (Day 2)**: Configured `select: false` on the User model's `passwordHash` field to prevent credential leakage in queries and API responses by default.
- **2026-10-17 (Day 2)**: Implemented dual duplicate-email defense: an early read check plus MongoDB `E11000` duplicate key handling to guarantee atomicity under concurrent registration requests.
- **2026-10-17 (Day 3)**: Implemented dual-token authentication: short-lived 15-minute JWT access token in memory + long-lived refresh token stored as SHA-256 hash in database with httpOnly strict cookie.
- **2026-10-17 (Day 4)**: Implemented single-use refresh token rotation with family reuse detection. If any previously used refresh token is re-submitted, the entire token family is immediately revoked to neutralize replay attacks.
- **2026-10-17 (Day 5)**: Established multi-tenant domain boundary with Organization and Membership models. The creator automatically receives the `owner` role, and an org loader middleware binds tenant context to every request.
- **2026-10-17 (Day 6)**: Implemented declarative RBAC matrix (`owner`, `admin`, `member`) and a deterministic `can(role, action)` helper to enforce least-privilege authorization across routes.
- **2026-10-17 (Day 7)**: Implemented owner safety invariants: the last owner cannot be demoted or removed, and admins cannot modify or promote owners.
- **2026-10-17 (Day 8)**: Built an append-only AuditLog collection without `updatedAt` timestamps to guarantee immutability, with non-blocking asynchronous logging to prevent latency impact on user operations.
- **2026-10-17 (Day 9)**: Configured tiered plan limits in config (`free`, `pro`, `enterprise`) and integrated Stripe Checkout & Customer Portal sessions, binding Stripe Customer ID directly to the Organization model.
- **2026-10-17 (Day 10)**: Implemented Stripe webhook idempotency via `WebhookEventModel` event ID tracking, preventing double-billing/double-upgrades.
- **2026-10-17 (Day 10)**: API keys follow the secret-reveal-once pattern (`ak_live_<prefix>_<secret>`), persisting only the SHA-256 hash and prefix in the database, with support for instant revocation.
- **2026-10-17 (Day 11)**: Implemented OpenAI-compatible Chat Completions proxy (`askdesk-gateway`) with friendly model alias mapping (`fast` -> `llama-3.1-8b-instant`, `smart` -> `llama-3.3-70b-versatile`) powered by Groq SDK for ultra-low latency inference.
- **2026-10-17 (Day 12)**: Implemented Server-Sent Events (SSE) streaming passthrough with client abort detection (`request.raw.on('close')`) to cancel upstream inference immediately when clients disconnect.
- **2026-10-17 (Day 13)**: Implemented Bearer API Key authentication in Gateway with 60-second Redis caching of key-to-tenant mapping to eliminate database roundtrips on high-frequency LLM requests.
- **2026-10-17 (Day 14)**: Implemented atomic Redis Token-Bucket rate limiting via custom Lua script, enforcing organization plan limits (`free`: 20 RPM / 40k TPM, `pro`: 120 RPM / 200k TPM, `enterprise`: 600 RPM / 1M TPM) with accurate `Retry-After` headers.
- **2026-10-17 (Day 15)**: Integrated non-blocking asynchronous usage and cost telemetry recording token counts and per-model pricing in MongoDB without adding latency to inference calls.
- **2026-10-17 (Day 16)**: Implemented exact-match Redis response caching with SHA-256 request fingerprinting, returning `X-Cache: HIT/MISS` headers while intelligently bypassing non-deterministic high-temperature requests (`temperature > 0.3`).
- **2026-10-17 (Day 17)**: Built resilient LLM runner with exponential backoff, jitter, and automatic failover to secondary provider on upstream 5xx errors or outages.
- **2026-10-17 (Day 18)**: Built batch embeddings endpoint (`/v1/embeddings`) with input validation, deterministic embedding vectors, and token usage accounting.
- **2026-10-17 (Day 19)**: Built analytics aggregation pipelines (`GET /v1/analytics`) computing summary token consumption, estimated spend, per-day breakdowns, per-model breakdowns, and p50/p95 latency percentiles.
- **2026-10-17 (Day 20)**: Configured k6 load testing scripts, multi-stage production Dockerfile, and docker-compose orchestration for end-to-end Gateway verification.
