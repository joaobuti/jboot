# Module Contract: bff-jboot-platform/modules/establishment-customers

Arquivo: `MODULE_CONTRACT.md`

Materializado via fluxo `PO -> PE -> Architect -> confirmacao humana` (ver `.claude/CLAUDE.md`), seguindo `ai-first-governance` e `make ai-conformance`, na branch `feature/comanda-autoatendimento`, como parte da fundacao da feature de autoatendimento/comanda digital.

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: extracao fisica concluida — modulo Nest proprio registrado em app.module.ts, build/typecheck/testes verdes dentro do container
last_status_review: 2026-10-10
```

Origem tecnica:

- `implementations/bff-jboot-platform/src/modules/pdv/admin/customers/*` (hoje subdominio interno de `AdminModule` do `pdv`, nao um `Module` Nest proprio).

Destino tecnico:

- `implementations/bff-jboot-platform/src/modules/establishment-customers/*`

## Responsabilidade

Cadastro de **cliente final do estabelecimento** (nivel 2 do dominio — quem come/compra na loja de um cliente da JBoot) — nao confundir com `clients` (nivel 1, `jboot_identity.clients`, os clientes da propria JBoot/tenants da platform). Tabela `pdv_establishment_customers` (nome mantido na extracao: `id`, `client_id`, `name`, `document_number`, `email`, `phone`, `status`).

Motivo da extracao: antes desta feature, `customers` so era consumido pelo admin do `pdv`. A partir desta entrega, `comanda` tambem precisa consultar/criar registro aqui (por `document_number` ou `phone`) para abrir/retomar sessao de comanda — dois consumidores tornam a extracao para modulo proprio necessaria, no mesmo espirito do `catalog` (dado compartilhado entre modulos).

Consumidores confirmados:

- `pdv` (admin, UI existente em `app-jboot-next-platform/src/app/(with-layout)/clientes` — permanece la, sem modulo frontend proprio).
- `comanda` (abertura/retomada de comanda por telefone/CPF).
- `kanban` (Flow, cliente final titular do card no CRM de leads).

## Debito de escopo conhecido (nao corrigir nesta entrega)

Mesmo padrao do `catalog`: os endpoints usam `@RequireScopes('pdv:admin:read'|'pdv:admin:write')` em vez de escopo proprio (`establishment-customers:read`/`write`). Documentado, nao desacoplado nesta entrega — mesma decisao ja tomada com o usuario para o `catalog`.

## Agents Do Modulo

- `agents/establishment-customers-domain.md`

## Skills Do Modulo

- `skills/establishment-customers-lookup.md`

## Ativacao Obrigatoria

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/establishment-customers
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-auth-context.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
    - implementations/bff-jboot-platform/modules/establishment-customers/agents/establishment-customers-domain.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
    - implementations/bff-jboot-platform/modules/establishment-customers/skills/establishment-customers-lookup.md
```

## Contratos Obrigatorios

- `implementations/bff-jboot-platform/modules/pdv/MODULE_CONTRACT.md` (consumidor historico, origem da extracao)
- `implementations/bff-jboot-platform/modules/comanda/MODULE_CONTRACT.md` (consumidor novo)
- `docs/architecture/decisions/013-customer-core-auxiliary-tables.md`
- `docs/architecture/decisions/015-flow-shared-customers-drive-ai-boundaries.md` (proposta; human gate pendente)
- `docs/product/establishment-customers-sprints.md` (Sprint 1 concluida; contracao das colunas fiscais do nucleo pendente pos-producao)
- `docs/product/sprint-juridico-flow.md` (clientes compartilhados no Flow e visibilidade por escritorio)
- `docker/postgres/init/060_customer_auxiliary_tables.sql` (fase de expansao: cria `customer_pdv` e `customer_juridico`)

## Modelo De Dados (ADR 013)

- Nucleo `pdv_establishment_customers`: somente informacao geral do cliente final
  (identificacao, contato, endereco postal, status).
- `customer_pdv` (1:1): dado especifico de PDV/NF-e (`ie`, `ind_ie_dest`,
  `address_ibge_code`).
- `customer_juridico` (1:1): dado juridico do cliente atendido pelo Flow.
- Tabelas auxiliares usam `customer_id` como PK/FK para o nucleo e mantem
  `client_id`. Estado de implementacao em `docs/product/establishment-customers-sprints.md`.
- Servicos Nest exportados: `CustomersService` (nucleo + `customer_pdv`, lido por LEFT JOIN; sem linha auxiliar `ind_ie_dest = 9`) e `CustomerJuridicoService` (`customer_juridico`, sem endpoint HTTP, sempre por `client_id`).
- Colunas fiscais antigas do nucleo (`ie`, `ind_ie_dest`, `address_ibge_code`) ficam congeladas e nao sao lidas nem gravadas pelo codigo ate a migration de contracao.
- Consumidor `kanban` (Flow, CRM de leads, Sprint 1 de
  `docs/product/flow-crm-leads-sprints.md`), por servico Nest exportado:
  `CustomersService.findIdsByCpf` (somente ids; CPF comparado so por digitos via
  `regexp_replace(document_number, '\D', '', 'g')`, inclui valor legado com
  mascara, sempre por `client_id`) e `CustomersService.createIfCpfAbsent`
  (unicidade de CPF por tenant validada no servico; grava CPF so com digitos;
  violacao do indice unico em corrida vira nova busca) e
  `CustomersService.discardJustCreated` (compensacao: apaga cliente criado na
  mesma requisicao quando o consumidor nao conclui o vinculo; so do `client_id`
  e sem `customer_pdv`; auditado como `pdv_customer_discarded`).
- Indice unico `pdv_establishment_customers_document_unique (client_id,
  document_number) WHERE document_number IS NOT NULL` existe desde `006_pdv.sql`
  e compara texto bruto. Indice por CPF normalizado nao foi criado porque o dev
  tem duplicidade normalizada (pendencia em `docs/product/flow-crm-leads-sprints.md`).

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:pdv` (roda dentro do mesmo processo `bff-jboot-platform`, sem target proprio)
  - purpose: cadastro/consulta de cliente final do estabelecimento.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: `GET /health` em Identity e Platform.
  - seed_dependencies: seeds Identity/PDV; tabela `pdv_establishment_customers` ja existente (`006_pdv.sql`), sem migracao de dado nesta entrega.

## Restricoes

- Nao criar autenticacao propria — continua sob `PdvAuthGuard`/`ScopeGuard` (debito documentado acima).
- Nao confundir com `clients` (nivel 1, tenant JBoot) em nenhum contrato, DTO ou nome de variavel — este modulo e exclusivamente nivel 2.
- `comanda` consome este modulo por import direto de servico Nest exportado, nunca duplica logica de busca/criacao de cliente final.
- Dado especifico de modulo nunca entra como coluna no nucleo; usar tabela auxiliar 1:1 propria (ADR 013).
- Consumidores nao leem nem gravam `customer_pdv`/`customer_juridico` diretamente; usam o servico do modulo.
