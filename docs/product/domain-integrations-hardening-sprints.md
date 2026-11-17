# Domain Integrations Hardening Sprints

## Objetivo

Consolidar `domain-integrations` como fronteira auditavel de orquestracao entre
dominios do JBoot, sem transforma-lo em dono das regras de Juridico, Flow ou de
qualquer produto integrado.

Esta iniciativa tem prioridade ativa por decisao humana de 2026-10-06. Novos
adapters de produto ficam suspensos ate a conclusao dos gates abaixo, salvo
ordem humana em contrario.

## Decisoes Confirmadas

- A unidade continua como `embedded_module` do `bff-jboot-platform`.
- A stack e o ciclo de deploy sao herdados do projeto host.
- Nao criar microservico, banco dedicado ou segundo runtime nesta iniciativa.
- O modulo resolve contextos de origem e destino server-side; `database_ref`,
  `application_id` e capacidades cruzadas nunca sao aceitos do payload.
- O chamador precisa possuir acesso efetivo aos dois dominios envolvidos.
- Cada integracao concreta possui adapter/use case proprio; o modulo nao
  absorve regras de negocio dos dominios.
- Rotas existentes permanecem compativeis durante o hardening.
- Architecture Graph e API Contract Graph devem ser atualizados no mesmo diff.

## Projetos E Dominios Afetados

| Alvo | Responsabilidade |
|---|---|
| `bff-jboot-platform/modules/domain-integrations` | contrato, autorizacao cruzada e ownership da orquestracao |
| `bff-jboot-platform/src/modules/domain-integrations` | facade HTTP, resolucao de contexto, exporters e monitoramento |
| `bff-jboot-platform/modules/juridico` | dados e regras de PJe/DataJud/monitoramento |
| `bff-jboot-platform/modules/kanban` | boards, cards, membership, atividades e automacoes |
| `app-jboot-next-platform/modules/juridico` | consumidores das exportacoes |
| `app-jboot-next-platform/modules/kanban` | consumidores do monitoramento pelo card |

## Sprint H1: Verdade Arquitetural E Contratual

Estado: **em andamento**.

Objetivo: reconciliar contrato, codigo, sprints, OpenAPI e graphs antes do
refactor funcional.

Entregaveis:

- inventario das rotas e consumidores reais;
- contrato do modulo atualizado com lifecycle, fronteiras e ownership;
- decisao arquitetural versionada;
- gate executavel desta iniciativa;
- nodes/edges cross-domain explicitos no Architecture Graph;
- decisao de idempotencia antiga encerrada: reexport retorna o recurso
  existente.

Criterios de aceite:

- nenhuma rota entregue permanece ausente do contrato do modulo;
- dependencias Juridico, Flow, Identity e Temporal ficam representadas;
- API Graph e Architecture Graph passam sem findings bloqueantes;
- contexto AI derivado e regenerado.

Fora de escopo:

- alterar comportamento HTTP;
- adicionar nova integracao de produto.

## Sprint H2: Contexto E Autorizacao Cross-Domain

Estado: **pendente**.

Objetivo: impedir que uma operacao cross-domain interprete o
`database_ref` do modulo chamador como banco do outro dominio.

Entregaveis:

- resolver tipado de application context por slug, identidade e cliente;
- politica explicita por operacao para scopes de origem e destino;
- validacao de membership/role do board nas operacoes iniciadas pelo Flow;
- guard limitado a autenticacao e contexto do chamador; autorizacao de
  negocio executada pelos use cases;
- testes negativos para tenant, entitlement, scope, board e banco incorretos.

Criterios de aceite:

- export iniciado no Juridico resolve Flow server-side;
- monitoramento iniciado no Flow resolve Juridico server-side;
- nenhum payload consegue sobrescrever tenant ou database reference;
- UUID conhecido de outro board/tenant nao concede acesso;
- erros permanecem estruturados e nao revelam existencia cross-tenant.

Fora de escopo:

- mudar scopes comerciais existentes;
- criar entitlement proprio para `domain-integrations`.

## Sprint H3: Decomposicao Em Adapters E Use Cases

Estado: **pendente**.

Objetivo: remover o service centralizado e tornar novas integracoes extensoes
locais, testaveis e auditaveis.

Entregaveis:

- facade fina para os endpoints existentes;
- `PjeToFlowExporter` e `DataJudToFlowExporter` independentes;
- mappers puros por origem;
- servico proprio para monitoramento de cards;
- subscriber proprio para mudancas processuais;
- ports tipadas para resolucao de contexto e destinos.

Criterios de aceite:

- nenhum adapter importa controller ou componente de outro dominio;
- regra de Juridico permanece no Juridico e regra de board permanece no Flow;
- testes unitarios instanciam cada use case sem construtor monolitico;
- contratos HTTP permanecem compativeis.

Fora de escopo:

- framework generico de ESB;
- registry dinamico ou plugins carregados em runtime.

## Sprint H4: Consistencia, Recuperacao E Observabilidade

Estado: **pendente**.

Objetivo: tornar falhas parciais entre bancos detectaveis, repetiveis e
recuperaveis.

Entregaveis:

- chave idempotente explicita por operacao;
- ordem de escrita e compensacao documentadas;
- retry seguro para auditoria/vinculo apos card ja existente;
- deduplicacao de eventos de mudanca e disparos de automacao;
- logs estruturados sem PII, com operation id, origem, destino e resultado;
- metricas com disponibilidade/proveniencia declaradas.

Criterios de aceite:

- retry apos falha entre bancos nao duplica card, atividade ou automacao;
- falha parcial nao e reportada como sucesso integral;
- operador consegue localizar e reconciliar uma operacao pelo identificador;
- dados sensiveis nao aparecem em logs ou attestations.

Fora de escopo:

- garantia distribuida exactly-once;
- novo broker ou workflow apenas para esta camada.

## Sprint H5: Production Readiness

Estado: **pendente**.

Objetivo: concluir a iniciativa com evidencia executavel e lifecycle coerente.

Entregaveis:

- testes de unidade, integracao e autorizacao no container;
- type-check, lint e build do backend e frontend consumidores;
- security checklist fechado;
- API Graph, Architecture Graph e AI conformance aprovados;
- attestation e evidence pack;
- revisao de `lifecycle_status` e `production_readiness` sem promocao indevida.

Criterios de aceite:

- todos os itens do gate terminal estao concluídos;
- nenhuma pergunta bloqueante permanece aberta;
- contrato e graph refletem o mesmo estado do codigo;
- nova integracao de produto pode ser planejada sem depender do service
  monolitico anterior.

Fora de escopo:

- declarar o BFF inteiro production-ready;
- cloud sync, graph database ou deploy do Architecture Graph Viewer.

## Debitos Conhecidos

- O checkout historico possuia sprints posteriores ainda nao integradas ao
  baseline limpo desta branch; somente mudancas comprovadamente dependentes
  desta iniciativa podem ser transportadas.
- Operacoes cross-database nao possuem transacao atomica; H4 deve definir
  recuperacao explicita sem prometer exactly-once.
- O API Graph registra um consumidor do `POST` de monitoramento como
  `planned`; a classificacao deve ser removida quando o consumidor for
  reconhecido pelo extrator ou ajustado ao contrato suportado.

