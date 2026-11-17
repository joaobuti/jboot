FROM debian:bookworm-slim

ARG INSTALL_DEV_DEPENDENCIES=false

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg lsb-release \
    nginx supervisor \
    && curl -sSL https://packages.sury.org/php/README.txt | bash \
    && apt-get update && apt-get install -y --no-install-recommends \
    php8.4-fpm \
    php8.4-cli \
    php8.4-bcmath \
    php8.4-pgsql \
    php8.4-mbstring \
    php8.4-xml \
    php8.4-curl \
    php8.4-soap \
    php8.4-gd \
    php8.4-zip \
    php8.4-redis \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/fiscal

COPY docker/nginx.conf /etc/nginx/sites-available/default
COPY docker/php-fpm.conf /etc/php/8.4/fpm/pool.d/www.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/fiscal.conf

COPY . .

RUN touch .env \
    && export FISCAL_CERT_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000; \
    if [ "$INSTALL_DEV_DEPENDENCIES" = "true" ]; then \
      composer install --optimize-autoloader --no-interaction; \
    else \
      composer install --no-dev --optimize-autoloader --no-interaction; \
    fi \
    && php artisan route:cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 8090

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/fiscal.conf"]
