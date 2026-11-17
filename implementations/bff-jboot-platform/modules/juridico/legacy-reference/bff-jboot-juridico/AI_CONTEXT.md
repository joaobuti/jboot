# AI Context: bff-jboot-juridico

## Quando Usar
- Use quando a demanda declarar `target_project: implementations/bff-jboot-juridico`.
- Antes de código funcional, leia o contrato do projeto e declare `Agent Activation`.

## Fonte De Verdade
- `implementations/bff-jboot-juridico/PROJECT_CONTRACT.md`

## Agents De Stack (Ler Antes dos Locais)
- `docs/agents/stacks/backend-node-typescript.md`
- `docs/agents/stacks/platform-temporal.md`
- `docs/agents/stacks/platform-redis-valkey.md`

## Agents Locais
- `implementations/bff-jboot-juridico/agents/backend-node-typescript.md`
- `implementations/bff-jboot-juridico/agents/juridico-auth-context.md`
- `implementations/bff-jboot-juridico/agents/juridico-postgres.md`

## Skills Locais
- `implementations/bff-jboot-juridico/skills/portal-registry.md`
- `implementations/bff-jboot-juridico/skills/tenant-credential-management.md`
- `implementations/bff-jboot-juridico/skills/scheduling-config.md`

## Regras Mínimas
- Qualidade e manutenibilidade acima de velocidade.
- Não implementar fora do `target_project` declarado.
- Não armazenar credenciais de portal sem criptografia.
- Credenciais nunca em logs, respostas ou traces.
- Workers não acessam banco — payload via Temporal.
