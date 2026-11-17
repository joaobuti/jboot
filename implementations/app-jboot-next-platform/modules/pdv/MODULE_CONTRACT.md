# Module Contract: app-jboot-next-platform/modules/pdv

Arquivo: `MODULE_CONTRACT.md`

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: rotas e componentes web PDV versionados na Next Platform
last_status_review: 2026-08-03
```

Modulo web PDV migrado para a Next platform modular.

Origem tecnica:

- `implementations/app-jboot-pdv-web` (removido em 2026-07-17; referencia historica em `implementations/bff-jboot-platform/modules/pdv/legacy-reference/bff-jboot-pdv/`)

Destino funcional:

- rotas em `implementations/app-jboot-next-platform/src/app`
- componentes/clientes de API em `implementations/app-jboot-next-platform/src/modules/pdv`

## Responsabilidade

Admin online e frente de caixa online do PDV dentro da Next platform, incluindo as telas staff da feature de comanda/autoatendimento (triagem, filas de cozinha/bar, fechamento) adicionadas em `feature/comanda-autoatendimento` — ver `implementations/bff-jboot-platform/modules/comanda/MODULE_CONTRACT.md` para o desenho completo do backend consumido por estas telas. A UI de "clientes" (`(with-layout)/clientes`) permanece neste modulo mesmo apos o backend correspondente ter sido extraido para `implementations/bff-jboot-platform/modules/establishment-customers` — so o backend mudou de modulo, a rota de UI nao.

Telas novas desta feature (cozinha, bar, balcao/triagem, fechamento) usam os mesmos escopos `pdv:comanda:cozinha|bar|balcao` do backend e seguem `docs/agents/orchestration/ui-ux.md`, obrigatorio antes de qualquer `frontend-*` local.

### Sprint 5 — Painel de acompanhamento (`/pdv/comanda/painel`)

Tela unica de status (fila/posicao/liberado), somente leitura — sem acao (encaminhar/finalizar/liberar/cancelar continuam exclusivas das telas de triagem/cozinha/bar). Pensada para ficar aberta numa TV (cozinha, bar ou salao), mas e a MESMA tela para qualquer publico, nao ha variante por tela fisica.

- **Decisao (confirmada pelo usuario em 2026-08-20)**: staff-autenticado, reaproveitando a sessao Identity/`pdv` ja existente — nao e endpoint publico. Motivo: evita abrir nova superficie publica de leitura de dado operacional (mesa/status) sem necessidade; staff loga uma vez e deixa a aba aberta na TV.
- **Sem endpoint novo**: compõe os 3 endpoints ja existentes do `ComandaAdminController` (`GET /pdv/comanda/itens/pendentes`, `GET /pdv/comanda/fila?queueType=cozinha|bar`, `GET /pdv/comanda/itens/prontos`), chamados em paralelo (`Promise.all`/`Promise.allSettled`) — nenhum repository/service novo no backend.
- Renderiza dentro do mesmo shell admin (`Layout`/sidebar/topbar) das telas de triagem/cozinha/bar — nao existe (nem foi criado) layout "kiosk" sem chrome; nao ha precedente disso no repositorio e criar um exigiria novo padrao de UI fora do escopo desta sprint.
- Reaproveita `ComandaQueueList` (agora com `actionLabel`/`actionIcon`/`onAction` opcionais e `showPosition` para numerar a posicao na fila) em vez de criar componente de lista novo.
- Cada secao (aguardando, cozinha, bar, pronto) carrega e falha de forma independente — se o operador logado nao tiver escopo para uma das secoes (403), so aquela secao mostra erro, as demais continuam funcionando.
- Item de menu "Comanda · Painel" visivel para quem tiver qualquer um dos escopos `pdv:comanda:balcao|cozinha|bar`.

## Agents Do Modulo

- `agents/pdv-web.md`
- `agents/pdv-cashier.md`
- `agents/pdv-admin-api.md`

## Skills Do Modulo

- `skills/pdv-web-ui.md`
- `skills/pdv-cashier-ui.md`
- `skills/pdv-admin-api-client.md`

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/app-jboot-next-platform`.

```text
Agent Activation:
  project: implementations/app-jboot-next-platform
  module: modules/pdv
  using_agent:
    - implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
    - implementations/app-jboot-next-platform/agents/platform-layout.md
    - implementations/app-jboot-next-platform/agents/backend-contract-client.md
    - implementations/app-jboot-next-platform/modules/pdv/agents/pdv-web.md
    - implementations/app-jboot-next-platform/modules/pdv/agents/pdv-admin-api.md
  using_skill:
    - implementations/app-jboot-next-platform/skills/next-module-pattern.md
    - implementations/app-jboot-next-platform/skills/platform-design-system.md
    - implementations/app-jboot-next-platform/skills/api-client.md
    - implementations/app-jboot-next-platform/modules/pdv/skills/pdv-web-ui.md
    - implementations/app-jboot-next-platform/modules/pdv/skills/pdv-admin-api-client.md
```

Adicionar `pdv-cashier`/`pdv-cashier-ui` para frente de caixa, venda e pagamento.

## Contratos Obrigatorios

- `docs/product/pdv-sprints.md`
- `docs/product/platform-files-sprints.md` (imagem de produto via upload centralizado)
- `docs/product/pdv-sprint-1-gate.md`
- `docs/api/pdv-sprint-1-openapi.yaml`
- `docs/design-system.md`
- `docs/product/comanda-sprints.md` (telas staff de comanda: triagem, filas, fechamento, painel, mesas/QR e mapa do salao)

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:pdv`
  - purpose: login, selecao no Identity e navegacao/admin online do modulo PDV.
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `minio` quando cadastro de produto usar upload de imagem.
    - optional: `rabbitmq` quando sync/offline/eventos exigirem.
    - forbidden_by_default: `mongodb`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
    - optional: PDV legacy BFF somente para migracao/comparacao.
    - forbidden_by_default: app mobile, workers nao relacionados.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: `GET /health` em Identity e Platform; abrir `/pdv`.
  - seed_dependencies: seed Identity do modulo PDV e schema PDV.
  - expected_resource_profile: medio, sem app mobile/offline sync.

### Rules

- `make code-restart TARGET=pdv` reinicia somente os processos Identity/Platform exigidos pelo modulo.
- Sync offline, mobile e eventos entram apenas em target/profile explicito quando a sprint exigir.

## Padroes de UI — Regras Fixas para Agents

Estas regras sao obrigatorias em toda implementacao frontend deste modulo. O agent deve aplicar sem precisar perguntar.

### Campos de Valor Monetario

- **Todo campo de entrada de valor monetario DEVE usar o componente `CurrencyInput`** (`src/components/Common/CurrencyInput`).
- Nao usar `<Input type="number">`, `<Input type="text">` nem `InputGroup` manual para valores em reais.
- O componente aceita `value: string` (decimal puro, ex: `"100.50"` ou `""`) e emite `onChange(rawDecimal: string)`.
- Para converter para `number` na chamada de API: `parseFloat(value) || 0`.
- Aceita prop `size="sm"` para contextos compactos (carrinho, tabelas).

### Campos de ID / FK (referencia a outra tabela)

- **Todo campo de entrada que represente ID de outra entidade DEVE ser um select com autocomplete.**
- Nao usar `<Input type="text">` nem `<Input type="select">` simples para FKs.
- Padrao: campo com debounce de busca → lista de opcoes → valor selecionado e exibido pelo nome (ex: nome do produto, nome do cliente), nao pelo UUID.
- O UUID selecionado e enviado ao backend; o label exibido ao usuario e o nome legivel.

## Restricoes

- Nao criar auth propria.
- Nao duplicar regra de autorizacao do backend.
- Nao reutilizar componentes mobile.
- Nao acoplar UI de fiscal ao core PDV.
