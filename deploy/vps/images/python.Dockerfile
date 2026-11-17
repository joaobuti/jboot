# Imagem de producao dos servicos Python gerenciados com uv
# (svc-jboot-juridico-data, wrk-jboot-juridico). Contexto = implementations/<projeto>.
#
# INSTALL_PLAYWRIGHT=1 instala o Chromium e as dependencias de sistema do
# Playwright (necessario no wrk-jboot-juridico, que faz scraping do eProc).
# O comando de execucao vem do compose (`command:`), porque cada servico sobe
# de um jeito (uvicorn x worker Temporal).
ARG PYTHON_IMAGE=python:3.13-slim-bookworm
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.9.5

FROM ${UV_IMAGE} AS uv

FROM ${PYTHON_IMAGE} AS runtime
ARG INSTALL_PLAYWRIGHT=0
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    PATH=/app/.venv/bin:$PATH
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev --no-editable \
    && if [ "$INSTALL_PLAYWRIGHT" = "1" ]; then \
         playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*; \
       fi \
    && useradd --system --uid 10001 --home /app app \
    && chown -R app:app /app
USER app
