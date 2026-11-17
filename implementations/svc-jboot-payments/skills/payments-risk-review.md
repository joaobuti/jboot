# Skill: Payments Risk Review

## Objetivo

Bloquear mudancas financeiras sem revisar duplicacao, tenant, valor, estado,
segredo, auditoria e recuperacao.

## Checklist

- [ ] nenhum efeito financeiro duplicavel;
- [ ] toda query filtra `client_id`;
- [ ] idempotencia cobre request e evento;
- [ ] valor divergente segue para reconciliacao;
- [ ] callback e URL externa tratados como nao confiaveis;
- [ ] segredo apenas por referencia;
- [ ] logs e traces sem PII/secret/handle;
- [ ] timeout nao dispara retry cego de criacao;
- [ ] outbox e transicao compartilham transacao;
- [ ] rollback e replay documentados.

Item aberto bloqueia merge da mudanca financeira.
