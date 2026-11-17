# Usuario x Apps

Mapa de usuarios cadastrados no Identity local/dev e seus acessos por projeto.

Fonte consultada em 2026-06-10:

- Banco local `jboot_identity`;
- seeds em `docker/postgres/init/*identity*_dev_seed.sql`.

## Credencial padrao dev

Todos os usuarios abaixo usam a senha de seed local:

```text
Jboot@123
```

## Usuarios com acesso ativo

| Usuario | Documento | Email | Apps ativos | URLs de entrada |
|---|---:|---|---|---|
| Operador Senior | `123.456.789-09` | `operador@example.local` | `identity-admin`, `pdv`, `juridico` | `http://localhost:3000/identity`, `http://localhost:3002/pdv`, `http://localhost:3002/juridico` |
| user pdv | `987.654.321-00` | `user.pdv@example.local` | `pdv` | `http://localhost:3001/dashboard` |

## Detalhe por app

### Operador Senior

Login:

```text
CPF: 123.456.789-09
Senha: Jboot@123
```

Apps:

| App | Cliente/Tenant | Roles | Scopes | Launch URL |
|---|---|---|---|---|
| `identity-admin` | JBoot Demo | `identity_admin`, `global_admin` | `identity:read`, `identity:write`, `identity:admin` | `http://localhost:3000/identity` |
| `pdv` | JBoot PDV Demo | `client_admin`, `pdv_admin` | `pdv:admin:read`, `pdv:admin:write`, `pdv:inventory:read`, `pdv:inventory:write`, `pdv:operators:manage` | `http://localhost:3002/pdv` |
| `juridico` | Advocacia Dev | `client_admin`, `juridico_admin` | `juridico:read`, `juridico:write`, `juridico:portais`, `juridico:admin` | `http://localhost:3002/juridico` |

### user pdv

Login:

```text
CPF: 987.654.321-00
Senha: Jboot@123
```

Apps:

| App | Cliente/Tenant | Roles | Scopes | Launch URL |
|---|---|---|---|---|
| `pdv` | JBoot PDV Demo | `client_admin`, `pdv_admin` | `pdv:admin:read`, `pdv:admin:write`, `pdv:inventory:read`, `pdv:inventory:write`, `pdv:operators:manage` | `http://localhost:3001/dashboard` |

## Acessos revogados observados

| Usuario | Documento | App | Cliente/Tenant | Status |
|---|---:|---|---|---|
| Operador Senior | `123.456.789-09` | `platform` | JBoot PDV Demo | `revoked` |
| user platform | `987.654.321-01` | `platform` | JBoot PDV Demo | `revoked` |
| user pdv | `987.654.321-00` | `identity-admin` | Smoke | `revoked` |

## Observacoes operacionais

- O usuario `123.456.789-09` e o caso principal para validar login com multiplos destinos controlados; `platform` nao e destino de login, os modulos contratados dentro dele sao.
- No Identity Admin, o login multiacesso deve selecionar automaticamente o destino `identity-admin`.
- Para apps de produto, o destino e escolhido pelo `applicationSlug` e pelo `launchUrl` retornado pelo Identity.
