# Non-Conformity: Frontend Nao Entregue Apos Conclusao Do Backend

date: 2026-08-22
severity: medium
status: corrected
owner: ai-governance
regression_test: AIF-EVAL-NC-003 in docs/ai-governance/evals/scenarios.yaml

## Expected

Quando o usuario pede a implementacao de uma feature/sprint que tem lado de interface, a entrega inclui backend **e** frontend. O turno so volta ao usuario quando a entrega esta completa ou quando ha bloqueio real.

## Actual

Padrao recorrente relatado pelo usuario em 2026-08-22: "varias vezes acontece de eu pedir a implementacao, o backend e gerado mas o frontend nao". Nessas ocasioes o usuario precisou emitir um "pode seguir" para que a camada de UI fosse implementada, mesmo sendo parte obvia e nao negociada do pedido original.

Observado na propria sessao do modulo `comanda` (Sprints 7-9): o turno foi devolvido ao usuario duas vezes exatamente na fronteira backend/frontend.

## Impact

- Entrega parece completa sem estar; o usuario descobre a lacuna ao tentar usar a feature.
- Custo de contexto: cada retomada reconstroi estado que ja estava carregado.
- Sprint marcada mentalmente como "feita" com metade da definicao de pronto ausente.

## Root Cause

Tres causas independentes que se somam:

1. **Checkpoint de reporte na fronteira errada.** A IA reporta progresso ao terminar o backend. Toda interrupcao externa (limite de contexto, permissao negada, falha de ferramenta/IDE) cai exatamente nesse ponto, produzindo o padrao observado.
2. **Assimetria de verificacao.** O backend tem cobertura de teste automatizada e o frontend praticamente nenhuma; "backend pronto" e demonstravel e vira marco, "frontend pronto" depende de inspecao humana e parece acabamento.
3. **Gate adicional no caminho do frontend.** A regra de acionar `docs/agents/orchestration/ui-ux.md` antes do agent `frontend-*` insere mais um passo antes da primeira linha de tela — passo que, em fim de turno, vira ponto natural de parada.

## Correction

- Regra adicionada em `AGENTS.md` (fonte canonica) e propagada para os adapters `.claude/CLAUDE.md`, `.codex.d/AGENTS.md`, `.cursor/rules/jboot-ai-architecture.mdc` e `.github/copilot-instructions.md`: backend e frontend da mesma sprint/feature sao um fluxo unico; sprint com tela so e `concluida` com as telas existindo e `type-check`/`build` passando dentro do container; interromper apenas por bloqueio real.
- Regra complementar registrada no mesmo conjunto: nao paralelizar backend e frontend em agents simultaneos enquanto o contrato de API nao estiver congelado e commitado. Paralelizacao foi avaliada e rejeitada para o estado atual — decisoes de formato de API nascem durante a implementacao do backend (prefixo de rota para evitar colisao com wildcard, campos derivados, semantica de status), entao um agent de frontend em paralelo implementa contra contrato imaginado.

## Prevention

- Ao concluir o backend de uma entrega com UI, seguir imediatamente para o frontend, sem devolver o turno pedindo confirmacao de continuidade.
- Em gate de sprint, tratar ausencia de tela como sprint incompleta, nao como pendencia menor.
- Debito conhecido que sustenta a causa 2: `implementations/app-jboot-next-platform` tem cobertura de teste minima e nenhuma tela de `comanda` coberta. Enquanto isso nao mudar, o unico gate objetivo do frontend continua sendo `type-check`/`build`.
