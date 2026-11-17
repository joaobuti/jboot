# Module Contract: app-jboot-next-platform/modules/juridico

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: rota DataJud, client tipado, validacao CNJ e componentes operacionais versionados; testes, type-check e build aprovados
last_status_review: 2026-08-27
```

Módulo criado a partir de migração do projeto standalone `app-jboot-juridico`.
Origem técnica: `implementations/app-jboot-juridico` (removido em 2026-07-17; nunca teve código-fonte versionado, apenas artefato de build)

## Responsabilidade

Portal jurídico dentro da Next platform: captação, automações e consultas jurídicas expostas por rotas amigáveis do módulo selecionado no Identity.

## Agents Do Modulo

- `agents/juridico-web.md`
- `agents/juridico-api-client.md`

## Skills Do Modulo

- `skills/juridico-web-ui.md`
- `skills/juridico-api-client.md`

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/app-jboot-next-platform`.

```text
Agent Activation:
  project: implementations/app-jboot-next-platform
  module: modules/juridico
  using_agent:
    - implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
    - implementations/app-jboot-next-platform/agents/platform-layout.md
    - implementations/app-jboot-next-platform/agents/backend-contract-client.md
    - implementations/app-jboot-next-platform/modules/juridico/agents/juridico-web.md
    - implementations/app-jboot-next-platform/modules/juridico/agents/juridico-api-client.md
  using_skill:
    - implementations/app-jboot-next-platform/skills/next-module-pattern.md
    - implementations/app-jboot-next-platform/skills/platform-design-system.md
    - implementations/app-jboot-next-platform/skills/api-client.md
    - implementations/app-jboot-next-platform/modules/juridico/skills/juridico-web-ui.md
    - implementations/app-jboot-next-platform/modules/juridico/skills/juridico-api-client.md
```

## Rotas

- `/juridico` — home do módulo Jurídico
- `/juridico/captacao` — captação e importação de oportunidades
- `/juridico/pje` — comunicações DJEN (Comunica PJe/CNJ): monitoramento, sincronização e listagem
- `/juridico/portais` — rota legada; deve redirecionar para `/juridico` sem chamar API
- `/juridico/usuarios` — gestão de usuários do módulo via `ModuleUserManager`
- `/juridico/consultas/cpf` — consulta por CPF (Sprint 4)
- `/juridico/consultas/processo` — consulta DataJud por número CNJ, com estados
  de erro, freshness, partes e movimentacoes (Sprint 1 funcional)
- `/juridico/acompanhamentos` — gestão DataJud: cadastro voluntário, cadência,
  pausa/retomada e exclusão com retenção limitada (Sprint 2 funcional)

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:juridico`
  - purpose: login, selecao no Identity e navegacao do modulo Juridico.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: `temporal`, `rabbitmq`, `otel-collector` quando a sprint exigir automacao/observabilidade.
    - forbidden_by_default: `mongodb`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`, `juridico-data-service`.
    - optional: `juridico-worker` para fluxos de portal, nao para consulta DataJud.
    - forbidden_by_default: workers de scraping.
  - ports: `3000`, `3002`, `8000`, `8010`, `8030`, `5432`.
  - healthchecks: `GET /health` em Identity, Platform e Juridico Data; abrir `/juridico/consultas/processo`.
  - seed_dependencies: seed Identity do modulo Juridico e capability `juridico-data`.
  - expected_resource_profile: medio, sem stack de automacao juridica.

### Rules

- `make code-restart TARGET=juridico` reinicia somente os processos Identity/Platform exigidos pelo modulo.
- Portais, scraping, filas e workflows duraveis entram apenas em target/profile explicito quando a sprint exigir.

## Contratos

- Fonte de verdade local: `implementations/app-jboot-next-platform/modules/juridico/MODULE_CONTRACT.md`.
- Consome `bff-jboot-platform/modules/juridico`.
- Integracao Flow: `docs/product/domain-flow-integration-sprints.md`, `docs/product/domain-flow-integration-sprint-1-gate.md`, `docs/api/domain-flow-integration-sprint-1-openapi.yaml`.
- Integracao DataJud: `docs/product/juridico-official-data-sprints.md`,
  `docs/product/juridico-official-data-sprint-1-gate.md` e
  `docs/api/juridico-data-sprint-1-bff-openapi.yaml`; fluxo visual em
  `docs/product/juridico-official-data-sprint-1-ux.md`.
- Monitoramento DataJud: `docs/product/juridico-official-data-sprint-2-gate.md`,
  `docs/api/juridico-data-sprint-2-bff-openapi.yaml` e
  `docs/data/juridico-data-sprint-2-data-model.md`; requer `ui-ux` antes de
  codigo frontend.
- API base: `NEXT_PUBLIC_JBOOT_PLATFORM_API_URL` (padrão: `http://127.0.0.1:8010`).
- Auth via cookie `authUser` (padrão da platform) com fallback para `juridicoAccessToken`.

## Decisoes De Contexto E UX

- Em rotas vinculadas a um portal especifico (`/juridico/eproc`, `/juridico/esaj`, `/juridico/projudi`), o portal e contexto implicito da operacao.
- Nao adicionar seletor de portal dentro de uma tela de portal especifico. Seletores de portal pertencem somente a telas agregadoras/multiportal.
- Em consulta manual dentro de uma tela de portal, o usuario informa apenas parametros da consulta daquele portal, como CPF e termo de busca.
- Se houver duvida se uma informacao deve ser inferida pelo contexto ou escolhida pelo usuario, interromper a implementacao e pedir validacao do usuario antes de criar controle novo.
- Nao supor regra de negocio ou UX quando houver ambiguidade relevante; pedir interacao com o usuario e registrar a decisao no contrato ou sprint correspondente.

## Restricoes

- Não criar auth própria — herda da platform.
- Não duplicar regra de autorização do backend.
- Não manipular credenciais de portal diretamente — consumir BFF.
- Nao chamar `svc-jboot-juridico-data` ou porta `8030` diretamente; DataJud e
  sempre acessado pelo client tipado do BFF.
- Usar `src/modules/juridico/lib/juridico-api.ts` para todos os contratos HTTP com o BFF.
- A UI de `Export to Flow` deve chamar apenas o contrato `domain-integrations`; nao deve importar client/componente interno do Kanban.
- Não importar componentes internos de outro módulo sem contrato explícito.
