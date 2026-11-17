# Skill: nest-module-pattern

## Objetivo

Definir o padrao minimo para criar ou alterar modulos NestJS no Modular Monolith da platform.

## Procedimento

1. Confirmar `target_module`.
2. Criar/alterar arquivos por dominio:
   - `*.controller.ts`
   - `*.service.ts`
   - `*.repository.ts`
   - `dto/*.dto.ts`
3. Controller nao acessa banco.
4. Service concentra regra de negocio.
5. Repository concentra SQL.
6. Fronteira de modulo (Modular Monolith — Grzybek, 2019):
   - Nenhum modulo importa Repository ou classe interna de outro modulo diretamente.
   - Comunicacao entre modulos somente via Service exportado em `@Module({ exports: [...] })` ou evento (EventEmitter2).
   - Importacao de implementacao interna de outro modulo e bloqueante antes de merge.
7. Validacao obrigatoria:

| Comando | Quando executar |
|---|---|
| `npx tsc --noEmit` | Sempre |
| `npx eslint src --max-warnings=0` | Sempre |
| `npx jest --passWithNoTests` | Solicitar autorizacao — nao executar em mudancas de layout, configuracao ou documentacao |

8. Revisao de SRP: todo metodo publico entregue nesta sprint tem uma unica responsabilidade? Metodo com mais de 20 linhas ou 3+ niveis de aninhamento deve ser decomposto antes do merge. Validacao de campo que poderia estar no DTO nao deve estar no service.
9. Security gate: se esta entrega inclui endpoint novo ou alterado, autenticacao, query de banco, log, DTO de entrada/saida ou dependencia nova — executar `security-checklist` (`docs/skills/security-checklist/SKILL.md`) antes de merge. Checklist preenchido e sem itens abertos.
