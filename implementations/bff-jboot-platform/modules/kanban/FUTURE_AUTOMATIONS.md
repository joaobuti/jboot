# Automacoes Futuras Do Motor De Automacao Por Coluna

Este arquivo registra ideias de automacao para o motor generico
`trigger_type`/`action_type` do modulo Flow (kanban) que foram levantadas em
conversa mas **nao viraram sprint formal**. Nao sao contrato — antes de
implementar qualquer item daqui, seguir o fluxo normal de governanca
(PO -> PE -> Architect -> confirmacao humana) descrito em `AGENTS.md`/
`CLAUDE.md`, igual foi feito para as Sprints 8 e 9.

Ver `docs/product/kanban-sprints.md` (Sprints 8 e 9) e
`docs/product/kanban-sprint-8-gate.md` / `docs/product/kanban-sprint-9-gate.md`
para o que ja esta implementado: `action_type=send_email_notification` e os
`trigger_type` `column_entered`, `column_left`, `due_date_approaching`,
`card_stale`, `juridico_process_moved`.

## Ideias Registradas

### 1. Criar subtarefa/checklist automaticamente

Ao entrar em uma coluna (ex.: "Audiencia Marcada"), criar automaticamente um
card filho ou item de checklist (ex.: "Preparar defesa"). Exigiria um
`action_type` novo (`create_child_card` ou similar) e, possivelmente, relacao
de card pai/filho que hoje nao existe no modelo (`Card` nao tem
`parent_card_id`). Maior escopo que os `action_type` atuais — provavelmente
sprint propria so para o relacionamento de cards antes de cogitar a acao.

### 2. Webhook de saida

Ao disparar uma regra, chamar uma URL externa configurada (ex.: sistema de
faturamento, ou o proprio BFF juridico para atualizar status do processo de
volta). Exigiria `action_type=webhook` com `action_config` guardando URL/
metodo/headers, politica de retry propria (ja existe BullMQ/retry no motor,
reaproveitavel), e cuidado de seguranca: nao permitir URL arbitraria sem
validacao (SSRF), provavelmente restringir a uma lista de destinos
conhecidos/allowlist por cliente.

### 3. Gerar/anexar documento padrao

Ao entrar em uma coluna, gerar automaticamente um documento a partir de um
template (ex.: minuta, procuracao) e anexar ao card. Exigiria `action_type`
novo, integracao com geracao de documento (motor de template, ex. DOCX/PDF a
partir de dados do card/processo) e com o `platform-files`/storage de anexos
ja existente (Sprint 4, `kanban-card-attachments`). E a ideia de maior escopo
das tres — provavelmente depende de decisao de produto sobre qual motor de
template usar, fora do escopo do Flow isoladamente.

## Por Que Nao Foram Implementadas Agora

Nenhuma das tres tem `action_type` correspondente no motor hoje (fundacao da
Sprint 8 cobriu so `send_email_notification`; Sprint 9 adicionou triggers,
nao actions novas). Implementar qualquer uma exige nova rodada de PO (regras
de negocio e criterios de aceite) e Architect (modelo de dados da acao,
Stack Fit Gate se envolver integracao externa como webhook), igual ao
processo que gerou as Sprints 8 e 9.
