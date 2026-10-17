FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/askdesk-chat/package.json ./apps/askdesk-chat/
RUN pnpm install --frozen-lockfile=false

COPY apps/askdesk-chat ./apps/askdesk-chat
RUN pnpm --filter askdesk-chat build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-workspace.yaml ./
COPY apps/askdesk-chat/package.json ./apps/askdesk-chat/
RUN pnpm install --prod --frozen-lockfile=false

COPY --from=builder /app/apps/askdesk-chat/dist ./apps/askdesk-chat/dist

EXPOSE 4002
CMD ["node", "apps/askdesk-chat/dist/index.js"]
