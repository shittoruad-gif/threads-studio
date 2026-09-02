FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS production
# Coolifyのヘルスチェックはコンテナ内のcurl/wgetで行われる。
# node:20-slim にはどちらも無く、正常起動していても unhealthy 判定→
# 旧版へ自動ロールバックされ、デプロイが必ず失敗する。curlを入れて解決する。
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
