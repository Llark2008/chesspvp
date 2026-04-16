FROM node:20-alpine AS builder

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY apps/server/tsconfig.build.json ./apps/server/tsconfig.build.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/shared/tsconfig.build.json ./packages/shared/tsconfig.build.json

RUN pnpm install --frozen-lockfile

COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

RUN pnpm --filter @chesspvp/shared run build
RUN pnpm --filter @chesspvp/server prisma generate
RUN pnpm --filter @chesspvp/server run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3001

CMD ["node", "apps/server/dist/index.js"]
