# Worker media — Debian 13 „trixie” cu ffmpeg, ExifTool (perl) și libheif (heif-dec + libde265).
# Build din rădăcina repository-ului: docker build -f apps/worker/Dockerfile .
#
# HEIC: sharp 0.35 cere libvips ≥ 8.18.6, iar Debian are 8.16 — deci sharp folosește binarul
# precompilat (fără HEIC), iar pozele HEIC se decodează cu `heif-dec` (research.md R5).
FROM node:24.21.0-trixie-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg perl libheif-examples libheif-plugin-libde265 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter "worker..." --filter "memories"

COPY tsconfig.base.json vitest.config.ts ./
COPY packages/shared packages/shared
COPY apps/worker apps/worker
COPY fixtures fixtures

WORKDIR /app/apps/worker
USER node
CMD ["node", "src/main.ts"]
