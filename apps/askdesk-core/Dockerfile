# Multi-stage production build for askdesk-core
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/askdesk-core/package.json ./apps/askdesk-core/
RUN pnpm install --frozen-lockfile=false

COPY apps/askdesk-core ./apps/askdesk-core
RUN pnpm --filter askdesk-core build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-workspace.yaml ./
COPY apps/askdesk-core/package.json ./apps/askdesk-core/
RUN pnpm install --prod --frozen-lockfile=false

COPY --from=builder /app/apps/askdesk-core/dist ./apps/askdesk-core/dist

EXPOSE 4000
CMD ["node", "apps/askdesk-core/dist/index.js"]
