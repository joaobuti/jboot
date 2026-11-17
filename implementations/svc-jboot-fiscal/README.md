# svc-jboot-fiscal

Serviço auto-hospedado de emissão de documentos fiscais eletrônicos (NFC-e e NF-e).
Recebe solicitações de BFFs autorizados via JWT s2s, assina e transmite XML para a SEFAZ.

Stack: PHP 8.4 + Laravel 13 + nfephp-org/sped-nfe · Banco: PostgreSQL (`jboot_fiscal`)

## Rodar localmente

```bash
make code-up TARGET=fiscal
```

Sobe `postgres` + `jboot-fiscal` (PHP-FPM + Nginx na porta 8090).

Verificar saúde:
```bash
curl http://localhost:8090/api/health
# {"status":"ok","timestamp":"..."}
```

## Configuração

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Variáveis obrigatórias:

| Variável | Descrição |
|---|---|
| `APP_KEY` | Gerar: `php artisan key:generate` |
| `FISCAL_CERT_ENCRYPTION_KEY` | Chave AES-256-GCM — gerar: `openssl rand -hex 32` |
| `IDENTITY_HUB_JWKS_URL` | Endpoint JWKS do Identity Hub |
| `FISCAL_SERVICE_AUDIENCE` | Claim `aud` esperado no JWT s2s (padrão: `svc:fiscal`) |

## Seed local

O arquivo `docker/postgres/init/024_fiscal.sql` é executado automaticamente ao subir o Postgres pela primeira vez. Cria o banco `jboot_fiscal` com todas as tabelas e sequências demo para os tenants de desenvolvimento.

## Migrations

```bash
docker compose exec jboot-fiscal php artisan migrate
```

## Testes

```bash
docker compose exec jboot-fiscal php artisan test
docker compose exec jboot-fiscal ./vendor/bin/pint --test
```

## Endpoints principais (Sprint 1)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/health` | Health check (sem auth) |
| `POST` | `/v1/certificados` | Upload de certificado A1 (PFX base64) |
| `POST` | `/v1/emissao/nfce` | Emitir NFC-e |
| `POST` | `/v1/emissao/nfe` | Emitir NF-e |
| `GET` | `/v1/documentos?chave_acesso=` | Buscar documento por chave de acesso |
| `GET` | `/v1/documentos/{id}/status` | Consultar status por ID interno |
| `POST` | `/v1/documentos/{id}/cancelamento` | Cancelar documento |
| `POST` | `/v1/documentos/{id}/cce` | Carta de Correção (NF-e apenas) |
| `POST` | `/v1/numeracao/inutilizacao` | Inutilizar faixa de numeração |

Todos os endpoints (exceto `/health`) exigem `Authorization: Bearer <jwt-s2s>` e `Idempotency-Key` nas emissões.

Documentação completa: `docs/api/fiscal-sprint-1-openapi.yaml`

## Logs

```bash
docker compose logs -f jboot-fiscal
```

## Arquitetura

```
app/Http/Controllers/    ← entrada HTTP (validação, extração de contexto)
Domain/Fiscal/
  DTOs/                  ← value objects tipados
  Builders/              ← constroem NFePHP\NFe\Make a partir dos DTOs
  Services/              ← regras de negócio (emissão, cancelamento, CC-e, inutilização)
  Repositories/          ← acesso ao banco
  Events/ + Listeners/   ← auditoria imutável em fiscal_document_events
  Exceptions/            ← exceções de domínio tipadas
Infrastructure/
  Crypto/                ← CertificateCrypto (AES-256-GCM)
  Sefaz/                 ← SefazGateway, DanfeGenerator, ContingenciaManager
Middleware/              ← ValidateServiceJwt, InjectClientContext
```
