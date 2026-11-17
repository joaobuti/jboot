# Skill: scheduling-config

## Objetivo

Gerenciar configuração de intervalos de polling de processos por tenant e portal.

## Procedimento

1. Receber configuração do tenant: `portal_id`, `interval` (daily | weekly | biweekly | monthly).
2. Persistir por `client_id` + `portal_id`.
3. Ao ativar ou atualizar configuração, criar ou reagendar workflow Temporal correspondente.
4. Ao desativar portal ou contrato, cancelar workflow Temporal pendente.
5. Expor status de agendamento por portal na API (próxima execução, última execução, status).

## Restrições

- Tenant só configura portais contratados.
- Intervalo mínimo: diário — não permitir intervalos menores.
- Reagendamento não deve disparar execução duplicada do mesmo ciclo.
