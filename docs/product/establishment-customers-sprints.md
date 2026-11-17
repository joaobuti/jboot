# Establishment Customers Sprints

## Objetivo

Manter `establishment-customers` como nucleo unico de cliente final, com
informacao especifica de cada modulo em tabelas auxiliares, conforme
`docs/architecture/decisions/013-customer-core-auxiliary-tables.md`.

## Decisoes De Escopo Confirmadas

- 2026-10-09: nucleo com informacao geral; dado de PDV/NF-e em `customer_pdv`;
  dado juridico do cliente do Flow em `customer_juridico`. Sem mudanca de banco.
- 2026-10-09: debitos de nome `pdv_`, banco compartilhado, scopes `pdv:admin:*`
  e JOINs diretos de `pdv/admin/comanda` ficam fora do foco atual.
- 2026-10-09: migration em duas fases (expand/contract). A Sprint 1 so expande:
  cria as tabelas auxiliares e copia os dados, sem remover colunas do nucleo. A
  remocao das colunas fiscais do nucleo fica para migration posterior ao merge e
  a aplicacao em producao, registrada como pendencia. Motivo: o banco de dev e
  de uso diario e a remocao so e segura depois que nenhum codigo em execucao le
  as colunas antigas; uma migration unica nao tem volta sem restaurar backup.

## Sprint 1: Nucleo Geral E Tabelas Auxiliares

Estado: **concluida** (2026-10-09).

Evidencia: migration `docker/postgres/init/060_customer_auxiliary_tables.sql`
aplicada duas vezes no banco de dev (idempotente; dev tinha 7 clientes, 0 com
dado fiscal, logo 0 linhas copiadas; a logica de copia foi validada em
transacao com ROLLBACK). Repositorio `customers.repository.ts` le por LEFT JOIN
em `customer_pdv` e grava nucleo + auxiliar na mesma transacao;
`CustomerJuridicoService` exportado pelo modulo. Testes de repositorio/servico
contra o Postgres real com ROLLBACK (262 testes do projeto passando), `tsc`,
`build` e `make ai-api-graph-gate` verdes. Rota e DTO inalterados. Os JOINs de
comanda nao leem colunas fiscais (debito da ADR, intocados).

Objetivo: separar do nucleo o dado especifico de PDV e criar a tabela juridica
usada pelo CRM de leads do Flow.

Entregaveis:

- Migration criando `customer_pdv` e `customer_juridico` (PK `customer_id`, FK
  para o nucleo, `client_id` obrigatorio).
- Fase de expansao: copia de `ie`, `ind_ie_dest` e `address_ibge_code` para
  `customer_pdv` (somente linhas com algum dado fiscal), sem remover essas
  colunas do nucleo.
- Repositorio de clientes lendo nucleo + `customer_pdv` (LEFT JOIN; sem linha
  auxiliar, `ind_ie_dest = 9`) e gravando ambos na mesma transacao, sem mudar o
  formato da API HTTP. O codigo novo nao le nem grava as colunas antigas do
  nucleo.
- Servico de leitura/gravacao de `customer_juridico` exportado pelo modulo.
- Testes automatizados de repositorio/servico para os itens acima.

Criterios de aceite:

- Cadastro e edicao de cliente no PDV continuam funcionando com os mesmos
  campos na tela e no DTO.
- Sugestao de cliente para NF-e em `sales.service` continua retornando os campos
  fiscais.
- Nenhum codigo le ou grava as colunas fiscais antigas do nucleo; as colunas
  continuam fisicamente no banco ate a fase de contracao (ver Pendencias).
- `customer_juridico` so e lido/gravado pelo servico do modulo e sempre filtrado
  por `client_id`.
- Migration idempotente e reexecutavel em banco novo e em banco existente.

Fora de escopo:

- Vinculo card <-> cliente no Flow (artefato de sprint do CRM de leads).
- Telas de cliente juridico.
- Itens listados como debito na ADR 013.

## Pendencias

| Pendencia | Classificacao |
|---|---|
| Fase de contracao: migration removendo `ie`, `ind_ie_dest` e `address_ibge_code` de `pdv_establishment_customers`, criada somente depois do merge da Sprint 1 e da aplicacao da fase de expansao em producao, com verificacao previa de que nenhum codigo le as colunas | pendente_pos_producao; nao bloqueia a Sprint 1 |
| Validar campos de `customer_juridico` com o cliente contra a qualificacao das partes das peticoes iniciais | pode_decidir_depois; nao bloqueia a migration, apenas a lista final de campos |

## Debitos Conhecidos

Ver secao "Fora Do Escopo Desta Decisao" da ADR 013.
