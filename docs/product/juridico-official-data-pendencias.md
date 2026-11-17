# Jurídico Official Data — Pendências Entre Sprints

Atualizado em 2026-08-29. Este é o registro canônico de pendências que não
impedem o encerramento das Sprints 0–4, mas devem ser reavaliadas antes de uma
sprint dependente ou de promoção a produção.

| ID | Pendência | Origem | Impacto | Próximo gate necessário | Estado |
|---|---|---|---|---|---|
| JUR-001 | Corrigir tipagem estática do worker eProc/`asyncpg` (`pyright`: 253 erros históricos). | Sprint 4 | Não bloqueia o adapter DJEN removido, mas impede usar `pyright` como evidência global do worker. | Sprint de hardening do worker, com baseline versionado e redução progressiva. | aberta |
| JUR-002 | Medir disponibilidade, latência e rate limit reais de DataJud e DJEN. | Sprints 1 e 4 | Não há base para SLA, capacidade ou cadência agressiva. | Observabilidade de produção com métricas sem PII e período de medição definido. | aberta |
| JUR-003 | Validar juridicamente/controladoria, retenção e classificação operador/controlador dos dados monitorados **e dos dados exportados para o Flow** (escopo ampliado em 2026-09-09 — ver seção abaixo). | Sprints 2 e 5–8 | `production_ready` permanece vedado sem essa validação. | Parecer jurídico/contratual e atualização dos contratos de lifecycle. | aberta |
| JUR-004 | Revisar persistência assíncrona de job PJe para execução durável fora do processo do BFF. | Sprint 4 | O fluxo atual é seguro em tenant/persistência, mas reinício do BFF pode interromper job em curso. | Sprint de orquestração durável, com worker somente chamando callback S2S do BFF. | aberta |
| JUR-005 | Definir catálogo/fonte oficial configurável por administrador para tribunais que não forem atendidos por fontes oficiais atuais. | Sprint 3 | Cobertura de feriados e suspensões ainda é nacional/base configurável. | Gate de produto, provenance e controles de administração. | aberta |
| JUR-006 | Avaliar DJe autenticado, provider comercial e MCP apenas como adapters opcionais. | Sprint 4 | Fora do escopo; não há autorização para acesso autenticado, contrato comercial ou exposição MCP. | PO → PE → Architect → confirmação humana por provider. | pendente de decisão |

## JUR-003 — Escopo Ampliado Em 2026-09-09

As Sprints 5–8 (`docs/product/juridico-datajud-flow-sprints.md`) mudaram o que
precisa de parecer. A versão original da pendência cobria apenas o
monitoramento, cujo dado vivia 180 dias após pausa ou exclusão.

**Decisões do usuário em 2026-09-09**, que o parecer deve validar juridicamente:

1. **Retenção por base de dados, não uniforme.** Dado exportado é permanente na
   base do **Flow**; na base do **Jurídico** pode ser removido, exceto o baseline
   necessário enquanto o monitoramento estiver ativo. Na prática: o Flow é o
   registro do cliente, o Jurídico é meio de obtenção.
2. **Fronteira de divulgação é intencional e correta.** Um usuário do Flow vê os
   dados persistidos na base do Flow; não se exige que ele tenha acesso ao
   módulo Jurídico. O parecer deve confirmar que isso é compatível com a base
   legal do tratamento, já que o dado processual passa a ser legível por pessoas
   fora do módulo de origem.
3. **Exclusão no Flow é lógica (soft delete)**, não física.

**Divergência resolvida em 2026-09-09.** O módulo Kanban expunha exclusão física
de card arquivado (`DELETE FROM kanban_cards`), entregue na Sprint 3 do Kanban.
O usuário decidiu que **apenas soft delete** é permitido, para quem tiver
papel/permissão — a permissão não mudou, o registro é que deixa de sair do
banco. Implementado na migration `057_kanban_card_soft_delete.sql` e em
`cards.repository.softDelete`, para **todo** card e não apenas os de origem
externa: um caminho único de exclusão é mais simples de auditar do que dois com
semânticas diferentes.

**Pontos adicionais para o parecer:**

- exceção ao direito de eliminação: uma vez exportado, o card não é apagado por
  rotina automática; qual o fundamento e como atender pedido de titular;
- o número do processo trafega **em claro** no card do Flow (título, descrição e
  `source_payload`), enquanto na base do Jurídico é cifrado e pseudonimizado por
  HMAC. A assimetria é deliberada — o card precisa ser legível —, mas muda a
  classificação do dado no Flow;
- auditoria do export existe no lado Jurídico (`juridico_audit_events`) desde a
  Sprint 6; confirmar se atende ao registro de operações exigido.

## Regras de transição

- Nenhuma pendência autoriza mudança de escopo por inferência.
- A sprint que consumir uma pendência deve referenciar este ID no seu gate e
  atualizar o estado com evidência verificável.
- `JUR-003` bloqueia qualquer declaração de `production_ready` para o fluxo de
  dados jurídicos monitorados.
