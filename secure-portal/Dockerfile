FROM node:22.17.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/edge/package.json apps/edge/package.json
RUN npm ci
COPY apps ./apps
RUN npm run build --workspace @bitwise-portal/api && npm run build --workspace @bitwise-portal/web

FROM node:22.17.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/edge/package.json apps/edge/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/src/migrations ./apps/api/dist/migrations
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 4100
CMD ["node", "apps/api/dist/server.js"]
