# Controlled-pilot preview image only. It must not contain production credentials
# or be used for real Telegram, bank, HRIS, or lender traffic.
FROM node:22-alpine

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm --filter @payease/shared-money run build \
  && pnpm --filter @payease/v1-domain run build \
  && pnpm --filter @payease/broker-api run build \
  && pnpm prune --prod

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

CMD ["node", "broker-api/dist/server.js"]
