# ADR 015: Clientes Compartilhados, Replica Drive E Fronteira De IA Do Flow

```yaml
date: 2026-10-13
status: accepted
decision_owner: human
human_confirmation: approved
confirmed_at: 2026-10-13
project: implementations/bff-jboot-platform
modules: [modules/establishment-customers, modules/kanban]
consumer: implementations/app-jboot-next-platform/modules/kanban
deployment_boundary: embedded_module
stack_decision: inherited_from_host
sprint_artifact: docs/product/sprint-juridico-flow.md
```

## Contexto

O Flow precisa listar e manter o cadastro mestre de clientes sem duplicar o
dominio de `establishment-customers`, restringir cada cliente aos escritorios
autorizados, criar cards a partir do cliente e replicar documentos de forma
opcional para Google Drive. A futura capacidade de IA continua sujeita a
decisoes legais, de dados e de provider.

A visibilidade existente por `kanban_cards.office_id` protege cards e o cliente
vinculado a eles, mas nao representa uma relacao persistente N:N entre cliente
e escritorio. As rotas existentes `/pdv/admin/customers` tambem nao sao um
contrato publico adequado para o Flow.

## Decisoes Propostas

1. `establishment-customers` permanece proprietario exclusivo do nucleo e de
   `customer_juridico`. Kanban consome apenas services exportados; SQL cruzado
   e proibido.
2. Kanban e proprietario de `customer_offices`, porque a relacao expressa a
   politica de visibilidade operacional do Flow. A tabela referencia somente
   IDs de cliente e nunca replica os dados mestre.
3. A fachada HTTP do Flow fica sob `/kanban/customers`, com DTOs proprios e sem
   campos fiscais internos do PDV. O servico orquestra policy do Kanban e
   services de `establishment-customers`.
4. `CreateCardFromCustomer` e comando idempotente do Kanban. A mesma transacao
   cria o card, o vinculo em `kanban_card_customers`, o vinculo de escritorio
   quando necessario e a activity somente com IDs.
5. MinIO/S3 permanece origem canonica. Google Drive, quando aprovado, e replica
   unidirecional implementada por `DocumentSyncPort`; nenhuma leitura do Drive
   altera workflow, autorizacao ou binario canonico.
6. O adapter Drive e seu worker permanecem embutidos no modulo Kanban e no
   deploy da Platform. Novo deploy unit exige reabrir o Deployment Boundary
   Gate por volume, isolamento ou SLO medido.
7. IA usa a fronteira compartilhada `src/ai`; o dominio juridico depende de uma
   porta, nunca de SDK. LLM nao recebe tools e sua saida nao executa mutacoes.
   Nenhum adapter de provider sera implementado antes do eval e da decisao
   humana de dados.

## Decisoes Humanas Pendentes

| Tema | Opcoes | Recomendacao tecnica | Estado |
|---|---|---|---|
| Scopes de clientes | dedicados `flow:customers:read/write` ou scopes gerais | dedicados, por menor privilegio e auditoria | aprovado |
| `customer_offices` | N:N persistente ou visibilidade derivada de cards | N:N persistente; cards nao cobrem cliente ainda sem card | aprovado |
| Credencial Drive | OAuth por tenant ou service account | OAuth por tenant; service account somente por nova decisao | aprovado |
| Retencao da replica | espelhar lifecycle, prazo proprio ou sem exclusao automatica | espelhar exclusao aprovada do canonico, respeitando legal hold | aprovado |
| IA | provider externo, hibrido ou local | decidir por politica de dados e eval; nenhuma escolha antecipada | bloqueado |

## Autorizacao E Isolamento

- `client_id` vem exclusivamente do contexto autenticado.
- Recurso de outro tenant ou escritorio nao visivel responde `404`.
- Operador enxerga a uniao dos seus escritorios; `flow:admin` enxerga todos e
  cada acesso global gera auditoria sem PII.
- CPF nunca e usado como oraculo: busca fora da visibilidade nao diferencia
  inexistente de recurso protegido.
- Credenciais sao write-only e persistidas apenas como referencia de segredo.
- Payloads de fila contem somente `databaseRef`, `clientId` e IDs/version.

## Dados E Idempotencia

O modelo detalhado esta em
`docs/data/flow-juridico-foundation-data-model.md`. Chaves de idempotencia sao
persistidas por tenant e operacao. Jobs Drive usam documento + versao + checksum
como identidade logica e nunca sobrescrevem silenciosamente uma versao remota.

## OpenAPI E Eventos

O contrato proposto esta em
`docs/api/flow-juridico-foundation-openapi.yaml`. Eventos/outbox sao criados na
mesma transacao da versao canonica ou do comando de card. Eventos e auditoria
contem somente IDs, estado, versao e codigos sanitizados.

## Architecture Graph

Em 2026-10-16, apos a entrega da Sprint 4 do Architecture Graph, o backfill
foi materializado em `docs/architecture-graph/registry.yaml`. As capacidades
`flow-shared-customers`, `flow-customer-offices`,
`flow-create-card-from-customer` e `flow-drive-replication` sao `active`;
`legal-ai` permanece `planned`, sujeita aos insumos e evals deste ADR.
As arestas registram ownership, consumidores, cadastro compartilhado,
integracao Drive, decisao e checklist de origem. O gateway generico de IA e
o conector Claude nao comprovam implementacao do processamento juridico.
O gate transversal deve passar para cada alteracao dessas fronteiras.

## Consequencias E Rollback

- A migration e aditiva; rollback funcional desativa rotas/features sem apagar
  vinculos ou historico.
- Desconectar Drive interrompe novos jobs, preserva o canonico e nao implica
  exclusao remota sem politica aprovada.
- Mudanca de scopes exige seed/entitlements e compatibilidade coordenada; nao
  deve ser ativada antes de backend e frontend estarem no mesmo contrato.

## Continuidade E Recuperacao

- RPO inicial: zero para metadados commitados e versoes canonicas confirmadas;
  uma intencao de sync so existe quando sua outbox foi commitada junto da
  versao canonica.
- RTO inicial: ate 4 horas para restaurar metadados, objetos canonicos e relay
  de jobs no ambiente operacional documentado.
- Replica Drive nao altera o RPO do canonico. Falha ou perda remota e
  reconciliavel a partir do CRM.
- Legal hold impede expurgo canonico e remoto. Fora de legal hold, a replica
  acompanha somente uma exclusao canonica aprovada e auditada.

## Gate

O human gate da fundacao foi aprovado em 2026-10-13. A fronteira de IA continua
bloqueada pelos insumos concretos listados na sprint: confirmacao nao substitui
provider, dataset/amostras, modelos reais ou avaliacao mensuravel.
