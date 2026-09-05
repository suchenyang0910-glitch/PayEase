FROM node:22-bookworm-slim AS build

WORKDIR /workspace

COPY . .

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
    && pnpm install --frozen-lockfile

RUN pnpm --filter @payease/shared-money run build \
    && pnpm --filter @payease/shared-security run build \
    && pnpm --filter @payease/lender-wallet-service run build \
    && pnpm --filter @payease/lender-core run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /workspace
ENV NODE_ENV=production

COPY --from=build /workspace /workspace

EXPOSE 3210
CMD ["node", "lender-wallet-service/dist/server.js"]
