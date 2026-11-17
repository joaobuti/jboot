# Imagem de producao das APIs NestJS (bff-jboot-identity, bff-jboot-platform,
# svc-jboot-ai-gateway). Contexto de build = implementations/<projeto>.
#   docker build -f deploy/vps/images/nest.Dockerfile implementations/bff-jboot-identity
# Debian (glibc), nao Alpine: @napi-rs/canvas (platform) so tem binario glibc.
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8000
CMD ["node", "dist/main.js"]
