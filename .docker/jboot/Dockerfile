FROM node:24-bookworm

ARG DEBIAN_FRONTEND=noninteractive
ARG GO_VERSION=1.25.13
ARG FLUTTER_CHANNEL=stable

ENV COMPOSER_ALLOW_SUPERUSER=1 \
    PNPM_HOME=/usr/local/share/pnpm \
    GOPATH=/go \
    GOBIN=/go/bin \
    FLUTTER_HOME=/opt/flutter \
    PATH=/usr/local/share/pnpm:/go/bin:/usr/local/go/bin:/opt/flutter/bin:/root/.pub-cache/bin:$PATH

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Add Ondrej Sury PHP repository (provides PHP 8.4 on Debian Bookworm)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release \
    && curl -sSLo /tmp/php-sury.gpg https://packages.sury.org/php/apt.gpg \
    && install -D -o root -g root -m 644 /tmp/php-sury.gpg /etc/apt/keyrings/php-sury.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/php-sury.gpg] https://packages.sury.org/php/ bookworm main" \
       > /etc/apt/sources.list.d/php-sury.list \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        curl \
        git \
        gnupg \
        fonts-freefont-ttf \
        fonts-ipafont-gothic \
        fonts-liberation \
        fonts-noto-color-emoji \
        fonts-tlwg-loma-otf \
        fonts-unifont \
        fonts-wqy-zenhei \
        jq \
        less \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgl1 \
        libnspr4 \
        libnss3 \
        libx11-xcb1 \
        libxcb-dri2-0 \
        libxcb-dri3-0 \
        libxcb-glx0 \
        libxcb-present0 \
        libxcb-randr0 \
        libxcb-sync1 \
        libxcb-xfixes0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxi6 \
        libxkbcommon0 \
        libxrandr2 \
        libxshmfence1 \
        make \
        openssh-client \
        pkg-config \
        unzip \
        vim \
        zip \
        python3 \
        python3-dev \
        python3-pip \
        python3-venv \
        php8.4-cli \
        php8.4-bcmath \
        php8.4-curl \
        php8.4-gd \
        php8.4-intl \
        php8.4-mbstring \
        php8.4-pgsql \
        php8.4-soap \
        php8.4-sqlite3 \
        php8.4-xml \
        php8.4-zip \
        php8.4-redis \
        php8.4-amqp \
        sqlite3 \
        xfonts-scalable \
        xvfb \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
    && npm install -g \
        @nestjs/cli \
        @modelcontextprotocol/inspector \
        eas-cli \
        npm-check-updates \
    && python3 -m pip install --break-system-packages --no-cache-dir \
        uv \
        ruff \
        pyright \
        fastapi \
        pydantic \
        langgraph \
        llama-index \
        openai \
        opentelemetry-api \
        opentelemetry-sdk \
    && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tgz \
    && tar -C /usr/local -xzf /tmp/go.tgz \
    && rm /tmp/go.tgz \
    && curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php \
    && php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer \
    && rm /tmp/composer-setup.php

RUN git clone --depth 1 --branch "${FLUTTER_CHANNEL}" https://github.com/flutter/flutter.git "${FLUTTER_HOME}" \
    && flutter config --no-analytics \
    && dart --disable-analytics \
    && flutter precache --web

WORKDIR /workspace

CMD ["sleep", "infinity"]
