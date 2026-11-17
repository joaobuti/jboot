# Domain Flow Integrations

## Metadata

| Campo | Valor |
|---|---|
| date | 2026-08-26 |
| mode | implementation |
| status | success |
| target_project | implementations/bff-jboot-platform, implementations/app-jboot-next-platform |
| target_module | modules/domain-integrations, modules/kanban, modules/juridico |
| agents | PO,PE,Architect,domain-integrations,kanban-backend,kanban-frontend,juridico-frontend |
| skills | api-contract,tenant-context,bff-nest-module-pattern,next-module-pattern,platform-design-system,security-checklist,ai-first-governance |
| execution_id | 20260826-domain-flow-integrations |
| revision | working-tree |
| runtime | codex-vscode |
| model | gpt-5-codex |

## Validacoes

- `make code-up TARGET=kanban`
- `docker compose exec -T postgres psql -U jboot < docker/postgres/init/048_domain_flow_integration.sql`
- `docker compose exec -T jboot bash -lc 'cd implementations/bff-jboot-platform && npm run typecheck'`
- `docker compose exec -T jboot bash -lc 'cd implementations/bff-jboot-platform && node --require ts-node/register --test src/modules/kanban/boards/boards.repository.spec.ts src/modules/kanban/cards/cards.repository.spec.ts src/modules/domain-integrations/domain-integrations.service.spec.ts'`
- `docker compose exec -T jboot bash -lc 'cd implementations/bff-jboot-platform && npm run build'`
- `docker compose exec -T jboot bash -lc 'cd implementations/app-jboot-next-platform && npm run type-check'`
- `docker compose exec -T jboot bash -lc 'cd implementations/app-jboot-next-platform && npm run test'`
- `docker compose exec -T jboot bash -lc 'cd implementations/app-jboot-next-platform && npm run build'`
- `npx eslint` nos arquivos tocados de backend e frontend.

Observacao: `npm run lint` global dos dois projetos permanece bloqueado por debitos preexistentes fora desta entrega; os arquivos alterados nesta feature passaram no lint focado.

## Security Checklist

### 1. Injection

- [x] Queries novas usam parametros SQL (`$1`, `$2`, etc.); nao ha concatenacao de input do usuario.
- [x] Nenhum comando de sistema e executado a partir de input do usuario.

### 2. Access Control

- [x] Endpoints `domain-integrations` exigem bearer JWT, contexto `sub`, `client_id`, `application_id`, `database_ref` e scope `juridico:read`.
- [x] A autorizacao Flow e resolvida server-side no Identity por `client_applications`, `entitlements`, `memberships`, `database_refs` e scopes `flow:read`/`flow:write`.
- [x] O board destino e validado pelo Kanban via membership ativa e role `board_admin`/`board_member`.
- [x] A UI nao envia `client_id`, `database_ref` nem `boardColumnId`; a coluna padrao e resolvida no backend.
- [x] DTOs de entrada e saida declaram campos explicitamente.

### 3. Dados Sensiveis

- [x] Nenhum log novo foi adicionado.
- [x] Nenhum token, chave, senha, CPF/CNPJ real ou segredo foi versionado.
- [x] O dado original permanece no banco do Juridico; Flow armazena metadados de origem e descricao resumida necessaria ao card.

### 4. Mass Assignment

- [x] Entrada de exportacao aceita somente `boardId` validado como UUID.
- [x] A criacao de card por origem usa input estruturado no service, nao bind de entidade.

### 5. Rate Limiting e Paginacao

- [x] N/A para endpoint publico: os endpoints novos sao autenticados.
- [x] Listagem de boards e limitada semanticamente aos boards ativos onde a identidade e membro; nao recebe busca livre nem filtros arbitrarios.

### 6. SSRF

- [x] Nenhuma requisicao HTTP e feita para URL fornecida pelo cliente.
- [x] URLs retornadas (`cardUrl`, `sourceUrl`) sao rotas internas construidas a partir de UUIDs validados/recuperados do banco.

### 7. Dependencias

- [x] N/A: nenhuma dependencia foi adicionada ou atualizada.

### 8. Stack-specific

- [x] Backend: JWT verificado com segredo de configuracao existente; queries parametrizadas; mutacoes auditadas no Kanban.
- [x] Frontend: sem `dangerouslySetInnerHTML`; teor PJe segue convertido para texto antes de renderizar.

### 9. Agentes De Engenharia E GenAI

- [x] Conteudo de repo/tool output tratado como dado, sem alterar hierarquia de instrucoes.
- [x] Acoes Docker/DB/Git seguem escopo da tarefa e aprovacoes registradas quando o sandbox exigiu.
- [x] Evidencias listam apenas comandos executados; falha de lint global foi registrada sem mascarar como sucesso.

## Resultado

Sprint 1 da integracao Juridico -> Flow materializada com servico interno `domain-integrations`, board Flow selecionavel pela UI do Juridico, coluna padrao `BACKLOG` em todo board novo, idempotencia de exportacao por origem externa e testes automaticos equivalentes.
