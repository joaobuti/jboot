# Imagem de producao dos apps Next.js com `output: "standalone"`
# (app-jboot-identity-admin com npm, app-jboot-next-platform com pnpm).
# Contexto de build = implementations/<projeto>.
#
# NEXT_PUBLIC_* sao embutidos no bundle no build (nao em runtime): por isso
# entram como build args, e a imagem e especifica do ambiente (producao).
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS build
ARG PACKAGE_MANAGER=npm
ARG PNPM_VERSION=10.34.9
ARG NEXT_PUBLIC_JBOOT_IDENTITY_API_URL
ARG NEXT_PUBLIC_JBOOT_IDENTITY_WEB_URL
ARG NEXT_PUBLIC_JBOOT_PLATFORM_API_URL
ARG NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL
ARG NEXT_PUBLIC_JBOOT_PDV_API_URL
ARG NEXT_PUBLIC_JBOOT_AI_GATEWAY_API_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_COOKIE_DOMAIN
ARG NEXT_PUBLIC_DEFAULT_AUTH=jboot
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_JBOOT_IDENTITY_API_URL=${NEXT_PUBLIC_JBOOT_IDENTITY_API_URL} \
    NEXT_PUBLIC_JBOOT_IDENTITY_WEB_URL=${NEXT_PUBLIC_JBOOT_IDENTITY_WEB_URL} \
    NEXT_PUBLIC_JBOOT_PLATFORM_API_URL=${NEXT_PUBLIC_JBOOT_PLATFORM_API_URL} \
    NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL=${NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL} \
    NEXT_PUBLIC_JBOOT_PDV_API_URL=${NEXT_PUBLIC_JBOOT_PDV_API_URL} \
    NEXT_PUBLIC_JBOOT_AI_GATEWAY_API_URL=${NEXT_PUBLIC_JBOOT_AI_GATEWAY_API_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_COOKIE_DOMAIN=${NEXT_PUBLIC_COOKIE_DOMAIN} \
    NEXT_PUBLIC_DEFAULT_AUTH=${NEXT_PUBLIC_DEFAULT_AUTH}
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
RUN if [ "$PACKAGE_MANAGER" = "pnpm" ]; then \
      npm install -g "pnpm@${PNPM_VERSION}" && pnpm install --frozen-lockfile; \
    else \
      npm ci --no-audit --no-fund; \
    fi
COPY . .
RUN if [ "$PACKAGE_MANAGER" = "pnpm" ]; then pnpm run build; else npm run build; fi \
    && mkdir -p .next/standalone/.next \
    && cp -r .next/static .next/standalone/.next/static \
    && cp -r public .next/standalone/public

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
