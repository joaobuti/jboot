# ADR 013: Nucleo De Cliente Final Com Tabelas Auxiliares Por Modulo

```yaml
date: 2026-10-09
status: accepted
decision_owner: human
project: implementations/bff-jboot-platform
module: modules/establishment-customers
consumers: pdv, comanda, kanban (flow, planejado)
database: jboot_pdv (inalterado nesta decisao)
```

## Contexto

`pdv_establishment_customers` e o cadastro de cliente final (nivel 2) consumido
por `pdv` e `comanda`. A migration `027_pdv_customers_nfe_fields.sql` adicionou
ao proprio nucleo colunas que so a emissao de NF-e do PDV usa.

O Flow passa a atender um CRM de leads com enfase juridica e precisa do mesmo
cliente final, com informacoes juridicas que nenhum outro modulo usa. Continuar
adicionando colunas no nucleo a cada modulo transforma o cadastro geral em uma
tabela de todos os dominios.

## Alternativas Avaliadas

| Alternativa | Risco | Decisao |
|---|---|---|
| Novas colunas no nucleo por modulo | Nucleo cresce com dado de dominio; acoplamento entre modulos | Rejeitada |
| Coluna JSONB de extensao no nucleo | Sem tipagem nem validacao no banco; contraria o padrao normalizado da platform | Rejeitada |
| Tabela auxiliar 1:1 por modulo, mesmo banco do nucleo | Uma tabela a mais por modulo consumidor | Escolhida |

## Decisao

O nucleo guarda somente informacao geral do cliente final. Informacao
especifica de modulo fica em tabela auxiliar 1:1, com `customer_id` como chave
primaria e FK para o nucleo, mais `client_id` para isolamento de tenant.

```text
pdv_establishment_customers (nucleo, informacao geral)
  id, client_id, name, document_number, email, phone, status,
  address_zip, address_street, address_number, address_complement,
  address_neighborhood, address_city, address_state, created_at, updated_at

customer_pdv (auxiliar 1:1, especifico de PDV/NF-e)
  customer_id (PK, FK -> nucleo), client_id,
  ie, ind_ie_dest, address_ibge_code

customer_juridico (auxiliar 1:1, cliente do Flow com enfase juridica)
  customer_id (PK, FK -> nucleo), client_id,
  data_nascimento, nacionalidade, estado_civil, profissao,
  rg_numero, rg_orgao_emissor, rg_uf, nome_mae,
  numero_beneficio, especie_beneficio, banco_pagamento,
  hipossuficiencia_declarada, observacoes
```

Regras:

- Novo dado especifico de modulo entra em tabela auxiliar propria, nunca como
  coluna no nucleo.
- Endereco postal permanece no nucleo por ser informacao geral; apenas
  `ie`, `ind_ie_dest` e `address_ibge_code` saem para `customer_pdv`.
- As tabelas auxiliares pertencem ao modulo `establishment-customers`, que expoe
  leitura/gravacao por servico Nest; consumidores nao acessam as tabelas
  diretamente.
- A API HTTP atual de clientes permanece com o mesmo formato: o repositorio le
  nucleo + `customer_pdv` e grava ambos na mesma transacao.
- Os campos de `customer_juridico` sao versao inicial e devem ser validados com
  o cliente contra a qualificacao das partes usada nas peticoes iniciais.

## Consequencias

- A migracao acontece em duas fases (expand/contract):
  - Expansao (Sprint 1 de `docs/product/establishment-customers-sprints.md`):
    migration aditiva e idempotente cria `customer_pdv` e `customer_juridico` e
    copia os tres campos fiscais existentes para `customer_pdv`, sem remover
    colunas do nucleo. A partir dela o codigo le e grava apenas
    `customer_pdv`.
  - Contracao (pendencia): migration separada remove `ie`, `ind_ie_dest` e
    `address_ibge_code` do nucleo somente depois do merge da expansao e da sua
    aplicacao em producao, quando nenhum codigo em execucao le essas colunas.
  - Motivo: a remocao na mesma migration nao tem volta sem restaurar backup e
    quebraria codigo ainda em execucao que le as colunas antigas durante o
    deploy; o banco de dev tambem e de uso diario.
- Ate a contracao, as colunas antigas do nucleo ficam congeladas: valores
  gravados apos a expansao vivem so em `customer_pdv`.
- `pdv`/`comanda` nao mudam de contrato; `sales.service` continua recebendo os
  campos fiscais pelo mesmo DTO.
- O Flow vincula card a cliente final por referencia (`kanban_card_customers`),
  definido no artefato de sprint do CRM de leads.

## Fora Do Escopo Desta Decisao (Debitos Registrados)

- Nome `pdv_` da tabela nucleo e banco compartilhado `jboot_pdv`.
- Endpoints de clientes sob scopes `pdv:admin:*`.
- JOINs diretos de `pdv/admin/comanda` na tabela nucleo
  (`comanda-admin.repository.ts`, `comanda-salao.repository.ts`).

Esses itens foram avaliados e ficaram explicitamente fora do foco por decisao do
usuario em 2026-10-09.
