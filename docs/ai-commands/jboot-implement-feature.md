# /jboot-implement-feature

## Objetivo

Implementar uma feature em projeto ou modulo existente com preflight visivel, agents/skills corretos, testes automatizados e validacao.

## Uso

```text
/jboot-implement-feature target=<project> module=<module-opcional> task="<tarefa>"
```

Exemplos:

```text
/jboot-implement-feature target=implementations/bff-jboot-platform module=modules/pdv task="endpoint de transferencia entre lojas"
/jboot-implement-feature target=implementations/app-jboot-next-platform module=modules/pdv task="tela de transferencias"
```

## Entradas

Obrigatorias:

- `target`: projeto alvo.
- `task`: tarefa a implementar.

Opcionais:

- `module`: modulo alvo.
- `plan`: referencia para saida de `/jboot-plan-feature`.
- `gate`: sprint gate.
- `validation`: comando de validacao esperado.

## Preflight

1. Identificar `target_project`.
2. Identificar `target_module` quando aplicavel.
3. Carregar `PROJECT_CONTRACT.md`.
4. Carregar `MODULE_CONTRACT.md` quando aplicavel.
5. Declarar `Agent Activation` antes de qualquer codigo.
6. Rodar `make ai-check` quando a mudanca for funcional ou afetar governanca.
7. Confirmar testes automatizados esperados.
8. Quando o modulo ou servico alvo tiver API, ler `make ai-api-context MODULE=<modulo|servico>` antes de abrir controllers, DTOs ou clientes; abrir apenas arquivos citados no recorte quando ele nao bastar.
9. Quando a tarefa tocar rota HTTP, controller, DTO de entrada/saida, cliente de API ou chamada s2s: rodar `make ai-api-impact` (ou `python3 tools/ai/api-graph.py --impact <rota|arquivo|Dto>`) e declarar no preflight os consumidores afetados. Revisar esses arquivos em vez de varrer telas ou o template Velzon.
10. Atualizar nodes/edges do Architecture Graph no mesmo change e executar `make ai-architecture-graph-gate`.
11. Se houver trigger estrutural definido em
    `docs/agents/orchestration/ai-graph-architect.md`, ativar o steward antes da
    decisao semantica; caso contrario, o executor atualiza o grafo diretamente.

## Agents E Skills

Usar:

- Agent local do projeto/modulo responsavel pela camada alterada.
- Skill local do projeto/modulo responsavel pelo padrao alterado.
- `docs/agents/orchestration/product-engineer.md`: revisao de aderencia operacional, contratos e validacoes.

Usar adicionalmente quando aplicavel:

- `docs/skills/security-checklist/SKILL.md`: se tocar endpoint, autenticacao, autorizacao, query, log, DTO, storage ou dependencia.
- `docs/skills/dev-runtime-profile/SKILL.md`: se tocar runtime local, seeds, portas, workers, healthchecks ou dependencias de runtime.
- `docs/agents/orchestration/ai-graph-architect.md`: se mudar schema/taxonomia,
  engine/gate, relacao cross-project ambigua, migracao/backfill, viewer contract
  ou houver drift nao mecanico. Nao usar para atualizacao rotineira.

## Fluxo

1. Confirmar que a tarefa nao cria novo projeto/modulo.
2. Ler contratos e plano.
3. Declarar `Agent Activation`.
4. Executar preflight.
5. Implementar mudanca no menor escopo correto.
6. Criar ou atualizar teste automatizado equivalente.
7. Rodar validacoes do projeto. Se a mudanca tocou API, `make ai-api-graph-gate` precisa passar; achado novo so e aceito em `tools/ai/api-graph-accepted.yaml` com categoria e motivo.
8. Atualizar contrato/gate quando houver mudanca operacional ou pendencia.
9. Registrar riscos, validacoes e pendencias.
10. Atualizar `lifecycle_status` somente quando as evidencias do estado e a Definition of Done sustentarem a promocao.

## Bloqueios

Bloquear implementacao quando:

- nao houver `Agent Activation`;
- nao houver target claro;
- a tarefa exigir fluxo de novo projeto/modulo;
- feature funcional nao tiver teste automatizado equivalente nem pendencia/risco aprovado;
- mudanca sensivel exigir security checklist e ele nao estiver preenchido;
- `make ai-api-graph-gate` falhar por drift de contrato HTTP nao aceito ou por entrada obsoleta em `tools/ai/api-graph-accepted.yaml`;
- `make ai-architecture-graph-gate` falhar ou componente arquitetural novo nao possuir node/owner/provenance;
- mudanca de runtime exigir dev runtime profile e ele nao estiver documentado.

## Saida Esperada

```text
AI Command:
  command: /jboot-implement-feature
  target_project:
  target_module:
  mode: implementation
  status:

Agent Activation:
  using_agent:
  using_skill:
  referenced_only:
  not_using:

Implementation:
  changed_files:
  behavior:
  tests:
  validations:
  open_risks:
```

## Nao Faz

- Nao cria novo modulo sem `/jboot-new-module`.
- Nao ignora teste por ausencia de test runner; registra risco e pede decisao quando necessario.
- Nao usa agent global de stack como executor principal quando houver agent local.
