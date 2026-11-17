# Domain Flow Integration Sprints

## Objetivo

Criar uma camada reutilizavel de integracao entre produtos do Hub e o Flow
(Kanban), permitindo transformar registros operacionais de um dominio em cards
de board sem acoplamento de frontend entre modulos.

## Decisoes Confirmadas

- Arquitetura confirmada pelo usuario em 2026-08-26: a primeira versao vive
  dentro do `bff-jboot-platform`, nao como projeto separado.
- A camada deve ser extensivel por adapter de origem/destino, com uma classe por
  integracao concreta.
- Fluxo inicial: Juridico -> Flow.
- O board selecionado define o destino; a coluna usada e a coluna padrao do
  board.
- Todo board Flow deve nascer com a coluna padrao `BACKLOG`, renomeavel pelo
  usuario, mas com UUID recuperavel pelo backend.
- O botao no Juridico fica visivel para todos os clientes e habilitado somente
  quando o cliente tambem tiver Flow contratado.
- Nenhuma implementacao deve depender de import interno entre componentes de
  frontend de modulos diferentes.

## Artefatos De Gate Por Sprint

| Sprint | Gate | Data Model | OpenAPI |
|---|---|---|---|
| 1 | `docs/product/domain-flow-integration-sprint-1-gate.md` | `docs/data/domain-flow-integration-sprint-1-data-model.md` | `docs/api/domain-flow-integration-sprint-1-openapi.yaml` |

## Projetos

| Projeto | Responsabilidade |
|---|---|
| `implementations/bff-jboot-platform/modules/kanban` | Expor contrato interno para criar card em coluna padrao e garantir `BACKLOG` em novos boards. |
| `implementations/bff-jboot-platform/modules/juridico` | Expor adapter Juridico -> Flow e validar acesso ao registro juridico de origem. |
| `implementations/bff-jboot-platform/src/modules/domain-integrations` | Orquestrar integracoes cross-module, capability contratada e auditoria de importacao. |
| `implementations/app-jboot-next-platform/modules/juridico` | Exibir acao `Export to Flow`, modal de boards e resultado da importacao. |
| `implementations/app-jboot-next-platform/modules/kanban` | Refletir contrato de board com coluna padrao recuperavel quando necessario. |

## Sprint 1: Juridico -> Flow

Estado: **concluida** em 2026-08-26; hardening posterior rastreado em
`docs/product/domain-integrations-hardening-sprints.md`.

Objetivo: permitir que um usuario no modulo Juridico crie um card no Flow a
partir de uma comunicacao/processo juridico selecionado.

Valor: dados capturados no Juridico viram trabalho operacional rastreavel no
Flow sem copiar manualmente numero do processo, tribunal, orgao, tipo e teor.

Fluxos:

- Usuario acessa a listagem de comunicacoes/processos no Juridico.
- Cada linha mostra `Export to Flow`.
- Cliente sem Flow contratado ve o botao desabilitado.
- Cliente com Flow contratado abre modal com os boards Flow acessiveis.
- Usuario seleciona um board e confirma.
- Backend encontra a coluna padrao do board e cria o card nela.
- Card criado guarda referencia estruturada ao registro juridico original.
- Usuario recebe link para abrir o card no Flow.

Entregaveis:

- Criacao automatica de coluna `BACKLOG` ao criar board Flow.
- Contrato backend para resolver a coluna padrao do board.
- Modulo backend `domain-integrations` com registry/adapters.
- Adapter `JuridicoToFlowImporter`.
- Endpoint de capacidades/listagem de boards para importacao.
- Endpoint para exportar comunicacao PJe para Flow.
- UI no Juridico com botao por linha e modal de selecao de board.
- Testes automatizados para coluna padrao, adapter e autorizacao.

Criterios de aceite:

- Board novo sempre possui exatamente uma coluna ativa `BACKLOG` na posicao `0`
  imediatamente apos a criacao.
- O UUID da coluna padrao e retornavel/recuperavel por contrato do backend.
- Cliente sem Flow contratado nao consegue executar a exportacao, mesmo que
  force chamada HTTP.
- Usuario sem acesso ao registro juridico de origem recebe erro estruturado.
- Usuario sem acesso ao board Flow recebe erro estruturado.
- Card criado possui titulo, descricao e referencia externa estruturada.
- A UI nao envia `client_id`, `database_ref` nem coluna manual.

Dependencias:

- Modulo `juridico` funcional.
- Modulo `kanban`/`flow` funcional.
- Identity deve permitir verificar se o cliente possui Flow contratado.

Riscos:

- Token do Juridico pode nao carregar scopes do Flow; a checagem de contrato do
  produto deve ser feita server-side, sem depender do frontend.
- Criar coluna padrao apenas por nome seria fragil; o backend deve ter forma
  explicita de recuperar a coluna padrao.
- Duplicidade e tratada por referencia externa: reexport para o mesmo board
  retorna o card existente.

Fora de escopo:

- Importacao reversa dentro do Flow.
- Selecionar coluna manualmente.
- Mapear campos customizados do Flow.
- Criar automacoes ou workflows duraveis.
- Exportar em lote.
