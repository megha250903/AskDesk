# AskDesk

Companies upload their documents and add an AI support chatbot to their site
with one script tag. Every tenant's data is isolated, usage is metered, and
prompt quality is tested in CI.

## How it works
1. **askdesk-core**: signup, orgs, roles, Stripe plans, API keys
2. **askdesk-gateway**: all LLM calls go through it (Groq primary, fallback
   provider, cache, per-plan rate limits, cost tracking)
3. **askdesk-chat**: document ingestion, Qdrant search filtered by tenant,
   answers with citations, embeddable widget, dashboard
4. **promptproof**: runs prompt tests on every PR and blocks quality drops

## Stack
TypeScript, Node, Fastify, React, MongoDB, Qdrant, Redis/BullMQ, Groq, Stripe,
Docker, GitHub Actions

## Key decisions
- Gateway in front of all LLM calls: one place for quotas, failover, and cost
- Single tenant-filtered search function, with a test that proves isolation
- Prompts live in versioned files and are tested like code

## Metrics (fill in from your own runs)
| Metric | Result |
|---|---|
| Gateway p95 latency | __ ms |
| Cache hit rate | __ % |
| Retrieval hit@3 / hit@5 | __ / __ |

## Quick start
`docker compose up`, then open http://localhost:3000
