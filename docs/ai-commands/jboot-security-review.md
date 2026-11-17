# /jboot-security-review

## Objetivo

Executar revisao de seguranca para mudancas sensiveis antes de merge ou conclusao da entrega.

## Uso

```text
/jboot-security-review target=<project> module=<module-opcional> scope="<escopo>"
```

Exemplos:

```text
/jboot-security-review target=implementations/bff-jboot-identity scope="manager users"
/jboot-security-review target=implementations/bff-jboot-platform module=modules/pdv scope="cashier and sales endpoints"
```

## Quando Usar

Obrigatorio quando a mudanca tocar:

- endpoints;
- autenticacao;
- autorizacao;
- queries de banco;
- logs;
- DTOs de entrada/saida;
- storage;
- dependencias;
- integracoes externas;
- dados pessoais ou sensiveis.

## Entradas

Obrigatorias:

- `target`: projeto alvo.
- `scope`: superficie revisada.

Opcionais:

- `module`: modulo alvo.
- `diff`: referencia do diff.
- `gate`: sprint gate.

## Preflight

1. Identificar `target_project`.
2. Identificar `target_module` quando aplicavel.
3. Carregar contratos.
4. Carregar diff ou arquivos alterados.
5. Acionar `docs/skills/security-checklist/SKILL.md`.

## Agents E Skills

Usar:

- `docs/skills/security-checklist/SKILL.md`
- Agent local responsavel pela camada alterada.

Referenciar:

- `docs/agents/orchestration/product-engineer.md`: para classificar risco operacional e evidencias.
- `docs/agents/orchestration/architect.md`: se houver decisao estrutural de seguranca.

## Fluxo

1. Mapear superficie alterada.
2. Verificar auth/autorizacao/scopes/roles.
3. Verificar isolamento por tenant/client/application.
4. Verificar DTOs de entrada/saida.
5. Verificar queries, filtros e vazamento de dados.
6. Verificar logs e dados sensiveis.
7. Verificar storage, arquivos e chaves.
8. Verificar dependencias e runtime.
9. Conferir testes e evidencias.
10. Classificar achados.

## Classificacao

- `blocking`: impede merge/conclusao.
- `risk-accepted`: risco aceito explicitamente pelo usuario ou contrato.
- `non-blocking`: pendencia documentada sem risco imediato relevante.
- `clean`: sem achados relevantes no escopo revisado.

## Bloqueios

Bloquear quando:

- checklist tiver item aberto;
- houver segredo, token, dado pessoal real ou credencial em codigo, docs ou commits;
- houver permissao generica indevida, como liberar produto com `platform:*`;
- endpoint sensivel nao validar scopes/roles;
- query multi-tenant nao filtrar contexto autenticado;
- mudanca sensivel nao tiver teste/evidencia equivalente.

## Saida Esperada

```text
AI Command:
  command: /jboot-security-review
  target_project:
  target_module:
  mode: security-review
  status:

Security Review:
  scope:
  checklist:
  findings:
  blocking:
  risk_accepted:
  non_blocking:
  tests:
  evidence:
```

## Nao Faz

- Nao substitui teste automatizado.
- Nao aprova merge com item bloqueante aberto.
- Nao registra dados sensiveis reais como exemplo.
