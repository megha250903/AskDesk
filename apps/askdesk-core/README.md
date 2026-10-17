# askdesk-core

The core control-plane microservice for AskDesk. Responsible for user authentication, session/token management, organization multi-tenancy, RBAC guards, audit trails, and billing integrations.

## Features

- **Fastify HTTP framework**: Lightweight, schema-driven, high throughput
- **Strict TypeScript**: Full strictness enabled
- **Zod Environment Validation**: Fail-fast configuration loading
- **Vitest**: Fast unit and integration tests with coverage
- **ESLint & Prettier**: Automated linting and formatting

## Scripts

- `pnpm dev`: Start development server with live reload (`tsx`)
- `pnpm build`: Compile TypeScript into `dist/`
- `pnpm start`: Run production build
- `pnpm test`: Execute test suite
- `pnpm test:coverage`: Generate test coverage reports
- `pnpm lint`: Run ESLint checks
- `pnpm typecheck`: Run TypeScript compiler checks without emitting code

## Routes (Day 1)

- `GET /health`: Returns service health status, uptime, and timestamp.
