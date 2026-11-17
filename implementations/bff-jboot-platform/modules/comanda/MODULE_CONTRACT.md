# Module Contract: bff-jboot-platform/modules/comanda

Arquivo: `MODULE_CONTRACT.md`

Materializado via fluxo `PO -> PE -> Architect -> confirmacao humana` (ver `.claude/CLAUDE.md`), seguindo `ai-first-governance` e `make ai-conformance`, na branch `feature/comanda-autoatendimento`. Modulo novo, primeira superficie publica/anonima do repositorio.

## Status

```yaml
lifecycle_status: scaffolded
production_readiness: not_assessed
status_evidence: contrato materializado, implementacao (Sprint 1-4) ainda nao iniciada
last_status_review: 2026-08-20
```

Destino tecnico:

- `implementations/bff-jboot-platform/src/modules/comanda`

## Objetivo de negocio

Eliminar o garcom da etapa de "tirar pedido" em restaurante/lanchonete: cliente pede via QR na mesa, sem app, sem login. Operador de Balcao controla explicitamente a passagem de cada item para producao e a liberacao para entrega; cozinha e bar processam em filas FIFO proprias; garcom so entrega fisicamente o que ja foi liberado. Fechamento (normal ou de comanda esquecida) exige confirmacao de pagamento pelo Operador de Balcao — cobranca sempre mediada por humano, **sem PSP/Pix/cartao digital em v1**.

## Excecao de governanca (UI sem sessao Identity)

`comanda` tem UI (o site publico do cliente) mas **nunca tera usuario Identity** — cliente final nao loga no Identity Hub, sessao e por telefone/CPF com token proprio. Isso nao se enquadra na regra generica de "todo modulo com UI precisa de `application_slug`/seed de entitlement/`ModuleUserManager`". Excecao confirmada explicitamente pelo usuario (nao inferida por IA) e formalizada em `.claude/CLAUDE.md`/`AGENTS.md` junto deste contrato. Criterio da excecao: ausencia de sessao Identity persistente, nao ausencia de UI — analogo, mas invertido, a excecao ja existente para servicos s2s sem UI.

- **Sem `application_slug` novo no Identity Hub.**
- **Sem seed de entitlement** para este modulo (nao ha usuario Identity do lado cliente).
- **Sem rota `/modulo/usuarios` nem `ModuleUserManager`** (nao ha usuario Identity para gerenciar).
- Lado staff (ver abaixo) continua sob `application_slug=pdv`, com seed de entitlement normal.

## Dois lados, dois modelos de autenticacao

### Lado cliente (publico, sem Identity Hub)

- Sessao de comanda aberta via QR (`client_id` + `table_number` no payload assinado) + telefone OU CPF informado pelo cliente.
- **Dois segredos JWT distintos, nunca compartilhados entre si nem com o Identity Hub**:
  - `JBOOT_COMANDA_QR_SECRET` — assina o token do QR de mesa. Payload `{ typ: 'comanda_table_qr', client_id, table_number, iat }`, sem expiracao por tempo (QR impresso nao pode expirar por prazo). Revogacao granular via `comanda_tables.token_version` (ver Modelo de Dados) — nao existe revogacao por rotacao de segredo isolada por mesa.
  - `JBOOT_COMANDA_SESSION_SECRET` — assina a sessao ativa do cliente. Payload `{ typ: 'comanda_session', client_id, customer_id, comanda_id, table_number, iat, exp }`, `exp` curto/medio (~8h), renovavel via `POST /comanda/public/sessions/refresh`.
- **Guard de sessao (`ComandaSessionGuard`) e implementacao independente, nunca importa nem reutiliza `PdvAuthGuard`.** Modelo hibrido: verifica assinatura do JWT E, em toda mutacao, releitura de `comandas.status` no banco — invalida sessao no fechamento sem precisar de blocklist/Redis.
- Endpoint de cardapio (`catalog/public/menu/:clientId`, ver contrato do `catalog`) e publico, sem guard nenhum — nao amarrado ao token de sessao.
- Controllers publicos (`comanda/public/*`) nunca declaram `@UseGuards(PdvAuthGuard, ...)` — checklist de review obrigatorio.

### Lado staff (dentro do `pdv`, Identity Hub normal)

Endpoints de triagem/fila/fechamento vivem em `AdminModule` do `pdv` (nao neste modulo), sob `application_slug=pdv`, com escopos novos `pdv:comanda:cozinha`, `pdv:comanda:bar`, `pdv:comanda:balcao`. Ver `implementations/bff-jboot-platform/modules/pdv/MODULE_CONTRACT.md`.

## Ausencia deliberada de validacao de presenca fisica (geolocalizacao/NFC)

Decisao de seguranca consciente, nao omissao. Risco considerado: cliente escanear/reenviar o link do QR fora do estabelecimento (wifi de restaurante costuma ser ruim, cliente usa dados moveis) e pedir remotamente sem estar na mesa. Mitigacao avaliada e descartada: geolocalizacao (GPS de navegador tem erro de 50-150m em ambiente interno, inviabilizando raio de 5-10m) e NFC (custo de hardware por mesa, sem suporte Web NFC em Safari/iOS). Mitigacao adotada: o freio ja existe na maquina de estados — todo item nasce `pendente` e so avanca para `em_producao` quando o Operador de Balcao o encaminha manualmente, momento em que confirma visualmente a ocupacao da mesa. Pedido remoto fica preso em `pendente` e nunca vira comida. **Nao entra como criterio de aceite de nenhuma sprint.** Se a operacao real mostrar que o freio manual nao basta, reabrir com dado de campo, nao especular agora.

## Maquina de estados do item de fila

```
pendente
   |  [Operador de Balcao encaminha manualmente]
   v
em_producao   -- fila FIFO de cozinha OU bar, conforme queue_type do produto (snapshot)
   |  [Staff Cozinha/Bar marca finalizado]
   v
pronto        -- fila de "prontos aguardando liberacao" do Operador de Balcao
   |  [Operador de Balcao libera]
   v
liberado_para_entrega  -- garcom entrega fisicamente, sem registrar nada no sistema
```

Cozinha/bar nao notificam o balcao automaticamente ao terminar — o balcao consulta a fila de `pronto` e libera.

Cancelamento: item `pendente` cancelavel por cliente (proprio pedido) ou balcao. A partir de `em_producao` (inclusive), so o Operador de Balcao pode cancelar, como excecao auditada (`cancel_is_exception=true`, `cancel_reason` obrigatorio).

## Comanda: individualidade e fechamento

- Comanda e sempre individual — N pessoas na mesma mesa geram N comandas independentes, sem agrupamento automatico.
- **Comanda multi-celular e escopo excluido** (confirmado pelo usuario em 2026-08-22): varias pessoas pedindo do proprio aparelho na mesma comanda nao e cenario a cobrir, nem backlog. Conta unica de grupo continua atendida — uma pessoa abre a comanda e lanca os pedidos da mesa no celular dela; a saida individual e resolvida pelo pagamento parcial da Sprint 9 (`POST /pdv/comanda/:id/pagamentos`), que abate saldo sem fechar a comanda e deixa pedidos novos aumentarem o saldo restante.
- Sessao sem token valido: cliente informa telefone OU CPF, sistema busca comanda **nao finalizada** desse telefone/CPF (via `establishment-customers`) e retoma se existir, cria nova se nao.
- Comanda sem atividade **nao expira automaticamente** — vira alerta de "comanda esquecida" para o Operador de Balcao quando `last_activity_at` ultrapassa 45 minutos.
- Fechamento (normal, solicitado pelo cliente, ou de comanda esquecida) **sempre exige confirmacao explicita de pagamento pelo Operador de Balcao** antes de `status='fechada'` — nao ha caminho de fechamento sem essa confirmacao. Cobranca sempre humana (caixa ou impresso para o garcom cobrar na mesa).
- Endpoint de fechamento fica em `AdminModule` (`pdv`), nao neste modulo — orquestra `SalesService` in-process (chamada de metodo, nao HTTP) e nao exige `pdv:sales:write` do Operador de Balcao.

## Modelo de dados (resumo — nomes finais, tabelas em `jboot_pdv`, prefixo `comanda_`)

- `comandas`: `id, client_id, customer_id, table_number, status ('aberta'|'fechada'), opened_at, last_activity_at, closing_requested_at, closed_at, paid_confirmed_by, paid_confirmed_at, closed_sale_id`. `UNIQUE (client_id, customer_id) WHERE status='aberta'`.
- `comanda_pedidos`: `id, client_id, comanda_id, submitted_at`.
- `comanda_itens`: `id, client_id, comanda_id, comanda_pedido_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, queue_type, notes, status, encaminhado_por/at, finalizado_por/at, liberado_por/at, cancelado_por/at, cancel_reason, cancel_is_exception`. Preco/nome/queue_type sempre resolvidos no servidor a partir do `catalog`, nunca aceitos do cliente.
- `comanda_tables` (condicional a revogacao granular de QR — aprovada): `id, client_id, table_number, label, status, token_version`.
- Sem tabela de sessao persistida — modelo hibrido JWT + `comandas.status` (ver acima).

`isolation_strategy`: compartilha `jboot_pdv` (mesmo padrao `shared_db` do `pdv`), sem database dedicado.

## Dependencias

- `implementations/bff-jboot-platform/modules/catalog/MODULE_CONTRACT.md` — leitura de produto/cardapio publico.
- `implementations/bff-jboot-platform/modules/platform-files/MODULE_CONTRACT.md` — URLs assinadas de imagens de produto exibidas no cardapio publico.
- `implementations/bff-jboot-platform/modules/establishment-customers/MODULE_CONTRACT.md` — resolucao de cliente final por telefone/CPF.
- `PdvAuditModule` (extraido de `pdv/admin/shared`, ver contrato do `pdv`) — auditoria de acoes do Operador de Balcao.

## Agents Do Modulo

- `agents/comanda-domain.md`

## Skills Do Modulo

- `skills/comanda-session-guard.md`
- `skills/comanda-queue-state-machine.md`

## Ativacao Obrigatoria

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/comanda
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
    - implementations/bff-jboot-platform/modules/comanda/agents/comanda-domain.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
    - implementations/bff-jboot-platform/modules/comanda/skills/comanda-session-guard.md
    - implementations/bff-jboot-platform/modules/comanda/skills/comanda-queue-state-machine.md
```

Nao usar `implementations/bff-jboot-platform/agents/platform-auth-context.md` nos controllers publicos de `comanda/public/*` — esse agent descreve o padrao de consumo do JWT do Identity Hub, que nao se aplica ao lado cliente. Usar apenas nos pontos que este modulo eventualmente compartilhar com `AdminModule` (nenhum hoje).

## Contratos Obrigatorios

- `docs/product/comanda-sprints.md`
- `implementations/bff-jboot-platform/modules/pdv/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/catalog/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/platform-files/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/establishment-customers/MODULE_CONTRACT.md`
- `implementations/app-jboot-next-platform/modules/comanda/MODULE_CONTRACT.md`

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:pdv` (roda dentro do mesmo processo `bff-jboot-platform`, sem target proprio — decisao de stack: baseline, sem app standalone separado)
  - purpose: autoatendimento publico (comanda) + suporte a feature staff dentro do `pdv`.
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `minio` quando cardapio publico exibir imagens de produto via `platform-files`.
    - forbidden_by_default: `mongodb`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: `GET /health` em Identity e Platform.
  - seed_dependencies: seeds Identity/PDV com escopos `pdv:comanda:*` adicionados (ver contrato do `pdv`); migracoes novas de `comandas`/`comanda_pedidos`/`comanda_itens`/`comanda_tables`; variaveis de ambiente `JBOOT_COMANDA_QR_SECRET` e `JBOOT_COMANDA_SESSION_SECRET`.

## Restricoes

- Nao criar sessao de comanda reaproveitando `PdvAuthGuard` ou o segredo JWT do Identity Hub, em nenhuma hipotese.
- Nao aceitar preco, nome de produto ou `queue_type` vindos do payload do cliente — sempre resolver no servidor via `catalog`.
- Nao implementar captura de pagamento (Pix/cartao) no lado cliente — fora de escopo v1, cobranca sempre humana.
- Nao adicionar geolocalizacao/NFC como criterio de aceite sem reabrir a decisao registrada acima com dado de campo real.
- Endpoint de fechamento so em `AdminModule` (`pdv`), nunca neste modulo.
