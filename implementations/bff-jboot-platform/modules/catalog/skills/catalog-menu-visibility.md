# Skill: catalog-menu-visibility

## Objetivo

Padronizar a leitura publica de cardapio (consumida pelo modulo `comanda`) e a validacao de cadastro que garante que todo produto visivel na comanda tem fila definida.

## Entradas

- `client_id` (path param do endpoint publico, sem JWT).
- Capability de tenant `comanda` em `jboot_identity.client_capabilities` (sub-modulo da application `pdv` no `capability_registry`). Historico: era flag jsonb `autoatendimento_habilitado` -> renomeada para `autoatendimento_comanda` (migracao `043`) -> migrada para `client_capabilities` (migracao `044`, ADR 008) para unificar com o mecanismo de sub-modulos e ganhar UI de gestao. Nao e entitlement de application: `comanda` nao tem `application_slug` proprio (sem sessao Identity persistente), e sub-modulo do contrato do PDV. Consumo: `cc.enabled = true AND cr.active = true`.
- `catalog_categories.visible_in_comanda`, `catalog_products.visible_in_comanda`, `catalog_products.queue_type`.

## Saidas

- `GET /catalog/public/menu/:clientId`: lista de categorias visiveis (`visible_in_comanda=true`) com seus produtos visiveis (`visible_in_comanda=true`), mais secao sintetica "Outros" para produto sem `category_id`.
- Validacao de DTO administrativo: bloqueia salvar produto com `visible_in_comanda=true` e `queue_type` vazio.

## Falhas Esperadas

- `client_id` sem flag `autoatendimento_comanda` ligada: retornar cardapio vazio (nao erro), para nao vazar existencia/inexistencia do tenant.
- Produto com `visible_in_comanda=true` e `queue_type` vazio no payload administrativo: `422` estruturado, nunca persistir.
- Categoria com `visible_in_comanda=false`: produtos dela nunca aparecem no endpoint publico, mesmo se individualmente visiveis.
