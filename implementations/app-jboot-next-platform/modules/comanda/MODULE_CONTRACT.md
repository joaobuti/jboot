# Module Contract: app-jboot-next-platform/modules/comanda

Arquivo: `MODULE_CONTRACT.md`

Materializado via fluxo `PO -> PE -> Architect -> confirmacao humana` (ver `.claude/CLAUDE.md`), seguindo `ai-first-governance` e `make ai-conformance`, na branch `feature/comanda-autoatendimento`. Modulo novo, primeira superficie publica sem shell administrativo do repositorio.

## Status

```yaml
lifecycle_status: scaffolded
production_readiness: not_assessed
status_evidence: contrato materializado, implementacao (Sprint 1-4) ainda nao iniciada
last_status_review: 2026-08-20
```

Destino tecnico:

- rotas publicas em `implementations/app-jboot-next-platform/src/app/comanda/[tableToken]/...` (route group fora de `(with-layout)` e `(auth)` — sem sidebar/topbar admin, sem shell Velzon, sem login).
- componentes/clientes de API em `implementations/app-jboot-next-platform/src/modules/comanda`.

## Responsabilidade

Front publico do autoatendimento: leitura de cardapio, carrinho, envio de pedido, acompanhamento da propria comanda e solicitacao de fechamento. Consumido por cliente final anonimo, sem login, no proprio celular (QR na mesa).

**Decisao de stack ja fechada** (Stack Fit Gate executado pelo PE/Architect): baseline — Next.js dentro deste mesmo projeto, renderizacao client-side (CSR) para as telas de comanda (sem SSR/RSC — nao ha ganho de SEO em rota nao indexavel acessada so via QR, e SSR complicaria a leitura do token de sessao do lado cliente). App standalone separado foi avaliado e descartado pelo usuario.

## Excecao de governanca (UI sem login)

Este modulo nao tem tela de login, nao usa Identity Hub, nao tem `application_slug`. Ver justificativa completa em `implementations/bff-jboot-platform/modules/comanda/MODULE_CONTRACT.md` (secao "Excecao de governanca") e na emenda em `.claude/CLAUDE.md`/`AGENTS.md`. Nao criar fluxo de autenticacao Identity aqui em hipotese alguma — sessao e via token proprio (`comanda_session`) emitido pelo backend, guardado em cookie/local storage no navegador do cliente.

## Fluxo de telas

1. `GET /comanda/:tableToken` (token do QR) — sem sessao: formulario de telefone/CPF. Com sessao (cookie): redireciona direto para o cardapio.
2. Cardapio: consome `GET /catalog/public/menu/:clientId` (backend `catalog`), agrupado por categoria + secao "Outros".
   - Produtos podem trazer `description` e `imageUrl`; a UI deve exibir imagem antes do nome quando houver, manter o botao de adicionar no fim da linha e permitir expandir a descricao.
3. Carrinho e envio de pedido: `POST /comanda/public/pedidos`.
4. Acompanhamento: `GET /comanda/public/me` — itens por pedido, total, status de cada item.
5. Solicitar fechamento: `POST /comanda/public/fechamento` — so sinaliza; nao fecha (pagamento e sempre humano, fora deste front).

## Agents Do Modulo

- `agents/comanda-web.md`

## Skills Do Modulo

- `skills/comanda-public-ui.md`

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/app-jboot-next-platform`, **exceto `platform-layout.md`** (descreve o shell administrativo Velzon, que este modulo nao usa).

```text
Agent Activation:
  project: implementations/app-jboot-next-platform
  module: modules/comanda
  using_agent:
    - implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
    - implementations/app-jboot-next-platform/agents/backend-contract-client.md
    - implementations/app-jboot-next-platform/modules/comanda/agents/comanda-web.md
  using_skill:
    - implementations/app-jboot-next-platform/skills/next-module-pattern.md
    - implementations/app-jboot-next-platform/skills/api-client.md
    - implementations/app-jboot-next-platform/modules/comanda/skills/comanda-public-ui.md
```

## Contratos Obrigatorios

- `docs/product/comanda-sprints.md`
- `implementations/bff-jboot-platform/modules/comanda/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/catalog/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/platform-files/MODULE_CONTRACT.md`
- `docs/agents/orchestration/ui-ux.md` (obrigatorio antes de qualquer `frontend-*` local, conforme `.claude/CLAUDE.md`)

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:pdv` (roda dentro do mesmo processo `app-jboot-next-platform`, sem target proprio)
  - purpose: autoatendimento publico via QR de mesa.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: `GET /health` em Identity e Platform; abrir `/comanda/:tableToken` sem sessao.
  - seed_dependencies: mesmas do backend `comanda`.

## Padroes de UI — Regras Fixas para Agents

- **Sem sidebar, topbar ou shell Velzon** — layout proprio, mobile-first, otimizado para celular do cliente segurando o telefone na mesa.
- **Sem tela de login** — o unico formulario de identificacao e telefone/CPF na abertura da comanda.
- Campos de valor monetario (preco no cardapio, total da comanda) seguem o mesmo padrao de exibicao do `CurrencyInput` (`src/components/Common/CurrencyInput`) apenas para formatacao de exibicao — nao ha campo de entrada de valor neste modulo (cliente nao digita preco).
- Todo estado de sessao (token, comanda ativa) fica em cookie/local storage proprio deste modulo, nunca reaproveita o cookie de sessao do admin (`pdvAccessToken` ou equivalente do Identity Hub).

## Restricoes

- Nao criar tela de login nem reaproveitar fluxo de autenticacao do Identity Hub.
- Nao reutilizar layout/shell administrativo (`(with-layout)`).
- Nao aceitar entrada de preco pelo cliente — cardapio e sempre somente leitura de preco vindo do backend.
- Nao implementar captura de pagamento (Pix/cartao) — fora de escopo v1.
