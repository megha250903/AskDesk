FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/askdesk-gateway/package.json ./apps/askdesk-gateway/
RUN pnpm install --frozen-lockfile=false

COPY apps/askdesk-gateway ./apps/askdesk-gateway
RUN pnpm --filter askdesk-gateway build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-workspace.yaml ./
COPY apps/askdesk-gateway/package.json ./apps/askdesk-gateway/
RUN pnpm install --prod --frozen-lockfile=false

COPY --from=builder /app/apps/askdesk-gateway/dist ./apps/askdesk-gateway/dist

EXPOSE 4001
CMD ["node", "apps/askdesk-gateway/dist/index.js"]
