# External Hosting Controls

## Escopo

Os workflows versionados implementam os required checks candidatos. A ativacao
de branch protection e uma configuracao externa do provedor Git e nao pode ser
inferida a partir do repositorio.

## GitHub

- Workflow: `.github/workflows/ai-governance.yml`.
- Required check esperado: `AI Governance / ai-check`.
- Exigir branch atualizada antes de merge.
- Bloquear bypass para mudancas em governanca, contracts e `implementations/*`.
- Preservar evidence artifact pelo periodo de auditoria definido pela operacao.

## GitLab

- Job: `ai-governance` no stage `verify`.
- Marcar o job como obrigatorio para merge request.
- Restringir push direto em branch protegida.
- Preservar evidence artifact segundo a politica do projeto.

## Estado

```yaml
repository_controls: implemented
github_hosting_verification: external_pending
gitlab_hosting_verification: external_pending
claim_impact: non_blocking_for_repository_architecture
production_governance_impact: blocking_until_verified
```

O claim AI-first engineering deste repositorio cobre a arquitetura e os
controles versionados. Promocao de governanca para producao exige evidencia do
provedor confirmando as protecoes acima.
