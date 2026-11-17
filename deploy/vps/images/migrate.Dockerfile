# Job one-shot de migracao de schema (servico `migrate` do compose de producao).
# Contexto de build = raiz do repositorio; o .dockerignore deste arquivo so deixa
# entrar o runner e os SQL.
#   docker build -f deploy/vps/images/migrate.Dockerfile .
# Mesma major do Postgres de producao (psql 18, com \getenv e \if).
FROM pgvector/pgvector:0.8.1-pg18
WORKDIR /migrations
COPY tools/db/migrate.sh tools/db/migrate.sh
COPY docker/postgres/init docker/postgres/init
COPY docker/postgres/prod docker/postgres/prod
USER postgres
ENTRYPOINT ["bash", "tools/db/migrate.sh", "--post", "docker/postgres/prod"]
