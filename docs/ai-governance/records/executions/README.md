# Execution Records

Use um arquivo por execucao funcional relevante.

Formato sugerido:

```text
# Execution: <titulo>

date:
execution_mode:
target_project:
target_module:
agent_activation:
contracts:
gate:
changes:
validation:
result:
residual_risk:
```

Novas execucoes devem usar attestation YAML conforme
`docs/ai-governance/schemas/execution-attestation.schema.json`. Este formato
Markdown permanece como visao humana; nao substitui a attestation nem seus
hashes, revisionamento e status de medicao.
