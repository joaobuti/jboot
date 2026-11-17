# Skill: ai-first-governance

## Objetivo

Aplicar e verificar o profile canonico de conformidade AI-first engineering.

## Quando Usar

- alteracao em contratos, agents, skills, adapters ou comandos de IA;
- criacao ou correcao de contexto gerado;
- mudanca de lifecycle de projeto ou modulo;
- mudanca em preflight, attestation, evals, metricas ou CI de governanca;
- auditoria ou afirmacao de conformidade AI-first.

## Fontes Obrigatorias

1. `docs/ai-governance/conformance/ai-first.yaml`
2. `docs/ai-governance/conformance/AI_FIRST_CONFORMANCE.md`
3. `docs/ai-governance/security/agentic-threat-model.md`
4. `docs/ai-governance/security/tool-approval-matrix.yaml`

## Procedimento

1. Identificar o revisionamento e o diff em escopo.
2. Classificar artefatos afetados e controles aplicaveis.
3. Atualizar a fonte canonica antes dos adapters derivados.
4. Atualizar contratos e lifecycle afetados.
5. Regenerar `AI_CONTEXT.md` e verificar freshness.
6. Adicionar eval positivo e negativo para regra critica nova.
7. Registrar attestation quando houver implementacao funcional relevante.
8. Executar `make ai-conformance`.
9. Gerar o evidence pack a partir do mesmo estado do repositorio.

## Bloqueios

- Nao declarar conformidade com controle bloqueante falhando.
- Nao usar existencia de Markdown como prova sem validacao executavel.
- Nao representar metrica indisponivel como zero medido.
- Nao fabricar proveniencia retroativa.
- Nao copiar regra para adapter sem atualizar a fonte canonica.

## Saida

```text
AI-first Governance:
  profile:
  revision:
  controls:
  evals:
  provenance:
  evidence_pack:
  status: conformant|nonconformant
```
