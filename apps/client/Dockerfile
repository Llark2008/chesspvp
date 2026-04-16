FROM node:20-alpine AS builder

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/client/tsconfig.json ./apps/client/tsconfig.json
COPY apps/client/tsconfig.app.json ./apps/client/tsconfig.app.json
COPY apps/client/tsconfig.node.json ./apps/client/tsconfig.node.json
COPY apps/client/vite.config.ts ./apps/client/vite.config.ts
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json

RUN pnpm install --frozen-lockfile

COPY apps/client ./apps/client
COPY packages/shared ./packages/shared

RUN pnpm --filter @chesspvp/client run build

FROM nginx:1.27-alpine AS runner

COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html
