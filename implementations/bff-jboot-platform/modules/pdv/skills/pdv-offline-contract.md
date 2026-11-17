# Skill: pdv-offline-contract

## Objetivo

Padronizar contratos offline/sync do PDV.

## Procedimento

1. Definir chave idempotente por cliente, dispositivo e operacao.
2. Aceitar reenvio sem duplicar efeitos.
3. Separar aceite, processamento e reconciliacao.
4. Registrar status e erros estruturados.
5. Nao depender de Redis como fonte de verdade.
