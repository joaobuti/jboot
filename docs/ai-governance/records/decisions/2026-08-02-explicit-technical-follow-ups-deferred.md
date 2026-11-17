# Decision: Explicit Technical Follow-ups Deferred

date: 2026-08-02
status: deferred_by_human
agents: product-engineer
skills: none
decision_owner: human
execution_authorized: false

## Context

A auditoria de alinhamento AI-first foi concluida. As correcoes arquiteturais e
documentais daquele escopo foram implementadas, mas permaneceram validacoes,
debitos tecnicos e itens de roadmap explicitamente identificados.

## Decision

O usuario decidiu registrar as pendencias abaixo e nao executa-las agora. Este
registro nao autoriza edicao funcional, deploy, push, promocao de lifecycle ou
inicio dos roadmaps. Cada retomada deve passar pelo fluxo aplicavel do
repositorio.

## Technical Follow-ups

1. **Builds no runtime Linux — prioridade alta**
   - Executar os builds do Identity Admin e da Landing no container `jboot`.
   - Evidencia esperada: comandos, versoes e resultados registrados.

2. **Testes contratuais no container — prioridade alta**
   - Executar `make contract-tests` no runtime oficial.
   - Evidencia esperada: seis testes aprovados no ambiente contratado.

3. **Backlog de lint do Identity Admin — prioridade alta**
   - Delimitar codigo ativo versus demonstracoes legadas do template.
   - Corrigir erros no codigo ativo, tratar legado e impedir crescimento do baseline.
   - Baseline observado: 752 ocorrencias.

4. **Pipelines remotos — prioridade alta**
   - Validar GitHub Actions e GitLab CI apos push.
   - Confirmar imagens, includes, rules, instalacao, jobs e artefatos.

5. **Production readiness por projeto — prioridade media**
   - Aplicar `docs/architecture/implementation-lifecycle.md` individualmente.
   - Nenhum projeto deve ser promovido sem Definition of Done completa.

6. **Testes do Identity Admin — prioridade media**
   - Cobrir formularios, onboarding, erros de API, autorizacao visual, estados
     de UI e navegacao administrativa.

7. **Testes da Landing — prioridade media**
   - Cobrir renderizacao, links/CTAs, metadata produzida, acessibilidade,
     smoke visual responsivo e artefato `out/`.

8. **Telemetria real da governanca — prioridade media**
   - Integrar tokens, custo e latencia dos runtimes ao registro de execucao.
   - Diferenciar valor real zero de metrica indisponivel.

## Product Roadmap Follow-ups

9. **Implementacoes ainda nao priorizadas**
   - `app-jboot-pdv-mobile`: `planned`.
   - `svc-jboot-fiscal`: `scaffolded`.
   - `src/ai`: runtime de IA `planned`, dependente de caso de uso, ADR e
     confirmacao humana.

## Tradeoffs

- Os projetos permanecem sem promocao para `production_ready`.
- Build e pipelines remotos continuam sem evidencia final desta rodada.
- O lint legado do Identity Admin permanece bloqueante conhecido.
- Metricas de tokens, custo e latencia permanecem indisponiveis.

## Resume Gate

Para retomar:

1. escolher explicitamente um ou mais itens;
2. confirmar target project e prioridade;
3. executar o preflight e ativar agents/skills locais aplicaveis;
4. criar plano/testes antes de codigo funcional;
5. para Mobile, Fiscal funcional ou AI runtime, cumprir os gates de produto e
   arquitetura correspondentes antes da implementacao.

## Validation

- decisao de adiamento confirmada pelo usuario em 2026-08-02;
- nenhuma correcao funcional autorizada por este registro;
- pendencias preservadas com prioridade, evidencia esperada e gate de retomada.
