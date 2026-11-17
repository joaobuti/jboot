# Implementation Lifecycle

## Objetivo

Definir uma linguagem unica para separar projeto documentado, scaffold tecnico,
software funcional e entrega pronta para producao. A existencia de
`PROJECT_CONTRACT.md`, agents ou skills nao prova que o produto esta implementado.

## Estados Canonicos

Todo `PROJECT_CONTRACT.md` e `MODULE_CONTRACT.md` ativo deve declarar exatamente
um `lifecycle_status`:

| Estado | Evidencia minima |
|---|---|
| `planned` | Escopo e contrato existem, mas nao ha runtime funcional. |
| `scaffolded` | Toolchain e estrutura executavel existem, sem fluxo funcional completo. |
| `in_progress` | Ha implementacao funcional parcial e trabalho bloqueante conhecido. |
| `functional` | O fluxo principal possui codigo e validacao automatizada reproduzivel. |
| `production_ready` | Definition of Done completa, operacao e rollback validados. |
| `deprecated` | Nao recebe novas features; destino de migracao ou arquivo esta documentado. |

Cada contrato tambem deve declarar:

```yaml
lifecycle_status: planned|scaffolded|in_progress|functional|production_ready|deprecated
production_readiness: not_assessed|blocked|ready
status_evidence: <comandos, testes ou artefatos que sustentam o estado>
last_status_review: YYYY-MM-DD
```

`functional` nao implica `production_ready`. Sem evidencias executadas, usar o
estado inferior ou `production_readiness: not_assessed`.

## Definition of Done

Uma entrega somente pode ser marcada como `production_ready` quando todos os
itens aplicaveis estiverem concluidos:

- [ ] contrato e inventario sincronizados;
- [ ] build, lint e typecheck aprovados;
- [ ] testes automatizados das funcionalidades novas aprovados;
- [ ] criterios de aceite e smoke test aprovados;
- [ ] autorizacao, dados, DTOs, logs, storage e dependencias revisados;
- [ ] `security-checklist` concluido quando aplicavel;
- [ ] Dev Runtime Profile, healthchecks, seeds e portas atualizados quando aplicavel;
- [ ] telemetria e diagnosticos operacionais definidos;
- [ ] deploy, rollback e migracoes documentados;
- [ ] riscos bloqueantes encerrados e riscos aceitos registrados;
- [ ] `make ai-check` aprovado;
- [ ] registro de execucao e metricas de governanca atualizado.
- [ ] `make ai-conformance` aprovado quando agents, skills, contratos, adapters,
      contextos ou governanca de IA forem afetados.

Itens nao aplicaveis devem ser marcados como `N/A` com justificativa. Presenca
de codigo, build isolado ou validacao manual nao substitui a lista completa.
