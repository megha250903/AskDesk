# Architecture & Technical Decisions (DECISIONS.md)

This log records major technical, architectural, and design choices made during development.

## Log

- **2026-10-17 (Day 1)**: Chosen pnpm monorepo structure with `apps/` and `packages/` to support multi-service architecture (`askdesk-core`, `askdesk-gateway`, `askdesk-chat`, `promptproof`) while sharing TypeScript and linting configs.
- **2026-10-17 (Day 1)**: Selected Fastify for `askdesk-core` due to high throughput, built-in schema validation, and lightweight lifecycle hooks.
- **2026-10-17 (Day 1)**: Configured Zod for runtime environment validation with fail-fast startup behavior on missing or invalid variables.
- **2026-10-17 (Day 1)**: Development workflow is configured for 100% native local execution (Node.js + pnpm) without requiring Docker locally.
