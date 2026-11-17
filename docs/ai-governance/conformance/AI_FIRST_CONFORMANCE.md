# AI-first Engineering Conformance

## Claim Normativo

O JBoot e categoricamente `AI-first` para governanca e execucao de engenharia
de software quando `make ai-conformance` estiver aprovado no revisionamento
avaliado.

O claim nao implica que produtos JBoot executem modelos em runtime. A maturidade
do runtime de produto e independente e permanece declarada em `src/ai/README.md`.

## Fonte Executavel

`docs/ai-governance/conformance/ai-first.yaml` e a fonte canonica
machine-readable. Este documento explica o contrato, mas nao o substitui.

## Harness Canonico

O `AI-first Engineering Harness` descrito em `docs/ai-architecture.md` e a
camada canonica de execucao, validacao, evidencia e controle para agentes de IA
no repositorio. Ele e composto por contratos executaveis, preflights, evals,
attestations, contexto deterministico e adapters de runtime.

MCP, plugins, IDEs e adapters de runtime podem consumir ou expor partes do
harness, mas nao substituem `docs/ai-governance/conformance/ai-first.yaml`,
`tools/ai/*` nem os comandos `make ai-conformance` e `make ai-evidence`.

## Semantica De Conformidade

Os termos `MUST`, `MUST NOT`, `SHOULD` e `MAY` seguem RFC 2119/8174.

Um revisionamento somente e `conformant` quando:

- todos os controles bloqueantes do profile estao satisfeitos;
- os thresholds foram atingidos;
- todos os contratos e referencias resolvem para arquivos ativos;
- contextos gerados sao reproduziveis e atuais;
- projetos e modulos possuem lifecycle com evidencia;
- evals positivos, negativos e adversariais deterministas passam;
- nao existe nao conformidade aberta de severidade `high` ou `critical`;
- indisponibilidade de metrica e explicita e nunca representada como zero;
- o evidence pack foi gerado a partir do mesmo revisionamento.

## Funcoes De Governanca

| Funcao | Aplicacao no JBoot |
|---|---|
| Govern | ownership, aprovacao humana, contratos, lifecycle e autoridade de tools |
| Map | contexto, fronteiras, dados, impacto, dependencias e trust boundaries |
| Measure | evals, thresholds, provenance, cobertura e nao conformidades |
| Manage | bloqueios, mitigacoes, rollback, revisao e regressao |

O harness e o mecanismo operacional que liga essas funcoes a comandos
executaveis e evidencias versionadas.

## Evidencia E Proveniencia

Execucoes funcionais relevantes devem gerar attestation estruturada. O modelo e
inspirado em SLSA: identifica executor, invocacao, revisionamento, entradas
resolvidas, parametros externos, validacoes e artefatos resultantes.

Attestation nao e prova de correcao isoladamente. Ela permite verificar quais
evidencias sustentam a declaracao.

## Politica De Evals

- Evals deterministas e adversariais sem custo externo: obrigatorios em PR.
- Evals que chamam modelos ou servicos pagos: agendados ou manuais, com budget.
- Toda nao conformidade corrigida deve apontar para teste de regressao.
- Mudanca de regra critica deve incluir caso positivo e negativo.

## Politica De Claim

Se um controle bloqueante falhar, a revisao e `nonconformant`. Documentos nao
podem manter a palavra `conformant` como evidencia suficiente: o resultado do
comando executavel prevalece.

## Referencias Normativas

- NIST AI RMF 1.0 e NIST AI 600-1 para governanca, mapeamento, medicao e gestao.
- OWASP Top 10 for Agentic Applications 2026 e OWASP LLM Top 10 2025.
- OpenTelemetry Semantic Conventions, com versao/stability registrada.
- JSON Schema Draft 2020-12.
- SLSA 1.2 e in-toto como referencia conceitual de proveniencia.
