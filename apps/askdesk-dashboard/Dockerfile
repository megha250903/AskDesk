# Multi-stage build for askdesk-dashboard
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/askdesk-dashboard/package.json ./apps/askdesk-dashboard/
RUN pnpm install --frozen-lockfile=false

COPY apps/askdesk-dashboard ./apps/askdesk-dashboard
RUN pnpm --filter askdesk-dashboard build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/askdesk-dashboard/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
