# Skill: establishment-customers-lookup

## Objetivo

Padronizar a resolucao de cliente final por telefone/CPF, usada tanto pelo admin do `pdv` quanto pela abertura/retomada de sessao do `comanda`.

## Entradas

- `client_id` (do contexto autenticado, no caso do admin `pdv`; do QR/token de mesa, no caso do `comanda`).
- `document_number` ou `phone` informado pelo cliente final.

## Saidas

- Registro existente de `pdv_establishment_customers` (retomada) ou registro novo criado (primeira visita).
- `customer_id` para o chamador vincular (ex.: `comandas.customer_id`).

## Falhas Esperadas

- `document_number`/`phone` invalido (formato): `422` estruturado, nao cria registro.
- Busca cross-tenant (documento existe em outro `client_id`): tratar como inexistente, nunca vazar dado de outro tenant.
