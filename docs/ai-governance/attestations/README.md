# Execution Attestations

Attestations registram proveniencia verificavel de execucoes assistidas por IA.
Elas seguem `docs/ai-governance/schemas/execution-attestation.schema.json`.

## Regras

- Uma attestation por execucao funcional ou mudanca material de governanca.
- `scope_paths` deve ser o menor escopo capaz de cobrir o diff.
- `revision` usa SHA Git quando a attestation for gerada fora do revisionamento.
  Attestation versionada usa `resolved_by_ci`; o job associa o artefato ao SHA
  imutavel da execucao. `working-tree` e aceito somente em validacao local.
- Hashes identificam instrucoes e contextos efetivamente usados.
- O harness revalida `instruction_set_sha256` contra arquivos atuais apenas
  quando `revision` aponta para a revisao atual ou `working-tree`. Attestations
  versionadas com `resolved_by_ci` preservam o hash historico registrado; nao
  devem ser reescritas quando fontes canonicas evoluem.
- Metricas indisponiveis usam `null` e status explicito; nunca zero ficticio.
- Aprovacao humana registra evidencia textual sem incluir dado sensivel.
- CI valida schema, referencias, escopo do diff e status de aprovacao.

## Como O Gate De Merge Request Avalia

`tools/ai/diff-preflight.py` roda no job `ai-governance` com a base do MR e
reprova quando:

- `revision` e `working-tree` (marcacao local-only);
- algum caminho do diff fica fora de `scope_paths`.

Duas consequencias praticas, ambas ja responsaveis por reprovacao real:

- `scope_paths` precisa cobrir **todo** arquivo alterado, inclusive gerados:
  `AI_CONTEXT.md`, `docs/ai-governance/evidence/*`, `ai-executions.tsv`,
  lockfiles e manifestos tocados pela execucao.
- O validador escolhe **uma** attestation: a ultima em ordem alfabetica entre as
  presentes no diff. Branch empilhada sobre outra feature nao mesclada faz o
  diff carregar execucoes alheias que nenhuma attestation cobre. Corte a branch
  a partir de `main` e mantenha um MR por execucao.

Rode `make ai-mr-check` antes de abrir o MR: e o mesmo comando do CI.
`make ai-diff-check` valida apenas a arvore nao commitada e nao substitui esse
gate.

Attestation comprova entradas e evidencias declaradas; nao substitui testes nem
prova isoladamente a correcao do resultado.
