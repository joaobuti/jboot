# Imagem de producao dos sites estaticos (site-jboot-landing: Next export ->
# out/; site-joao-buti-portfolio: Astro -> dist/). Contexto = implementations/<projeto>.
# O build gera HTML puro; o runtime e um Caddy servindo arquivos, sem Node.
ARG NODE_IMAGE=node:24-bookworm-slim
ARG CADDY_IMAGE=caddy:2.10.2-alpine

FROM ${NODE_IMAGE} AS build
ARG OUTPUT_DIR=out
ARG SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1 \
    SITE_URL=${SITE_URL}
WORKDIR /app
COPY package.json package-lock.json .npmrc* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && mv "${OUTPUT_DIR}" /site

FROM ${CADDY_IMAGE} AS runtime
COPY --from=build /site /srv
EXPOSE 8080
CMD ["caddy", "file-server", "--root", "/srv", "--listen", ":8080"]
