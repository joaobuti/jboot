---
name: jboot-platform-execution
description: Use when implementing or modifying JBoot platform projects under implementations/bff-jboot-platform or implementations/app-jboot-next-platform, including module-specific agents and skills.
---

# Claude Skill Adapter: JBoot Platform Execution

Fonte de verdade:

- `implementations/bff-jboot-platform/PROJECT_CONTRACT.md`
- `implementations/app-jboot-next-platform/PROJECT_CONTRACT.md`
- `implementations/*/modules/*/MODULE_CONTRACT.md`

## Procedimento

1. Declarar `target_project`.
2. Declarar `target_module`.
3. Ler contrato da platform.
4. Ler contrato do modulo.
5. Emitir `Agent Activation`.
6. Implementar somente depois do gate.
7. Validar conforme contrato.
