# Skill: comanda-queue-state-machine

## Objetivo

Padronizar as transicoes de estado do item de fila e as regras de cancelamento, garantindo que producao real (cozinha/bar) so comece apos triagem humana do balcao.

## Entradas

- Item em `pendente`, `em_producao`, `pronto` ou `liberado_para_entrega`.
- Ator da transicao: cliente (so cancelamento em `pendente`), Staff Cozinha/Bar (so `em_producao -> pronto`, filtrado por `queue_type`), Operador de Balcao (`pendente -> em_producao`, `pronto -> liberado_para_entrega`, cancelamento de excecao).

## Saidas

- Transicao valida registrada com ator/timestamp (`encaminhado_por/at`, `finalizado_por/at`, `liberado_por/at`).
- Cancelamento registrado com `cancelado_por/at`, e `cancel_reason`/`cancel_is_exception=true` quando fora de `pendente`.

## Falhas Esperadas

- Staff Cozinha tentando finalizar item com `queue_type='bar'` (ou vice-versa): `403`.
- Cancelamento de item `em_producao`+ sem `cancel_reason`: `422`, nao persiste.
- Transicao fora de ordem (ex.: `pendente -> pronto` direto): `409`, estado invalido.
