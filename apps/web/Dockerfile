# Aplicația web pentru un server propriu (docs/livrare-server-propriu.md).
# Build din rădăcina repository-ului: docker build -f apps/web/Dockerfile .
#
# Variabilele NEXT_PUBLIC_* sunt incluse în bundle la build (ajung în browser), deci se dau ca
# argumente de build; secretele (SUPABASE_SERVICE_ROLE_KEY etc.) se dau doar la rulare.
FROM node:24.21.0-trixie-slim AS build

WORKDIR /app
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "web..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_OUTPUT=standalone
RUN pnpm --filter web build

FROM node:24.21.0-trixie-slim

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
