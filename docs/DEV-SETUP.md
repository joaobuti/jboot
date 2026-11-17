# JBoot — Guia de Ambiente Local

## Pré-requisito

O container `jboot` deve estar rodando. Se não estiver:

```bash
make infra-up
```

---

## Mapeamento de projetos e portas

| Projeto | Repositório (frontend) | Repositório (backend) | Porta Frontend | Porta Backend |
|---|---|---|---|---|
| **Identity** | `app-jboot-identity-admin` | `bff-jboot-identity` | `3000` | `8000` |
| **PDV** | `app-jboot-next-platform/modules/pdv` | `bff-jboot-platform/modules/pdv` | `3002` | `8010` |
| **Jurídico** | `app-jboot-next-platform/modules/juridico` | `bff-jboot-platform/modules/juridico` | `3002` | `8010` |

Não há conflito de portas — todos os projetos podem rodar simultaneamente.

---

## Como subir os projetos

### Todos os projetos de uma vez

```bash
make dev-up-all
```

### Identity + Jurídico

```bash
make dev-up TARGET=juridico
```

> Identity é sempre iniciado como base de autenticação. Este comando sobe identity + jurídico.

### Identity + PDV

```bash
make dev-up TARGET=pdv-legacy
```

### Apenas Identity

```bash
make dev-up TARGET=identity
```

### Adicionando projetos incrementalmente

O script detecta automaticamente o que já está rodando e pula o que já está ativo. Ou seja, você pode chamar `make dev-up` várias vezes com targets diferentes sem derrubar o que já está no ar.

**Exemplo — subir jurídico e depois adicionar o PDV:**

```bash
make dev-up TARGET=juridico    # sobe identity + jurídico
make dev-up TARGET=pdv-legacy  # detecta identity já ativo, adiciona só o PDV
```

Ao final terá identity + jurídico + PDV rodando simultaneamente. O equivalente direto é:

```bash
make dev-up-all
```

---

## Subir serviços individualmente

Use quando precisar reiniciar só um processo sem derrubar os demais.

```bash
make identity-backend-dev    # API identity   → :8000
make identity-frontend-dev   # Admin identity → :3000
make platform-backend-dev    # API platform   → :8010
make platform-frontend-dev   # Web platform   → :3002
```

---

## URLs após subir

| Serviço | URL |
|---|---|
| Identity Admin | http://localhost:3000/login |
| Identity API | http://localhost:8000/health |
| Platform Web / PDV | http://localhost:3002/pdv |
| Platform Web / Jurídico | http://localhost:3002/juridico |
| Platform API | http://localhost:8010/health |

---

## Acompanhar logs em tempo real

```bash
# Identity
docker compose exec jboot tail -f /tmp/jboot-dev-identity-api.log
docker compose exec jboot tail -f /tmp/jboot-dev-identity-admin.log

# Platform
docker compose exec jboot tail -f /tmp/jboot-dev-platform-api.log
docker compose exec jboot tail -f /tmp/jboot-dev-platform-web.log
```

---

## Abrir shell no container

```bash
make shell
```

---

## Outros comandos úteis

```bash
make infra-ps      # status dos containers
make infra-logs    # logs de todos os containers
make infra-down    # derrubar toda a infra
```
