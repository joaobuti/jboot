# Project Contract: app-jboot-pdv-mobile

## Status

```yaml
lifecycle_status: planned
production_readiness: blocked
status_evidence: Sprint 0 contem somente contrato, agents e skills; nao ha runtime mobile versionado
last_status_review: 2026-08-02
```

Sprint 0: arquitetura e contratos. A implementacao funcional ainda nao foi iniciada.

## Stack

- React Native
- Expo
- TypeScript
- SQLite local

## Responsabilidade

App mobile/tablet do PDV com operacao offline-first e venda finalizavel sem internet.

## Agents

- `agents/mobile-react-native.md`: executor principal do app.
- `agents/offline-sync.md`: armazenamento local, fila offline, sync e conflitos.

## Skills

- `skills/pdv-mobile-ui.md`
- `skills/offline-first-pdv.md`
- `skills/local-storage-contract.md`

## Ativacao Obrigatoria

Antes de qualquer codigo neste projeto, a execucao deve declarar explicitamente:

```text
Agent Activation:
  project: implementations/app-jboot-pdv-mobile
  using_agent:
    - implementations/app-jboot-pdv-mobile/agents/mobile-react-native.md
    - implementations/app-jboot-pdv-mobile/agents/offline-sync.md
  using_skill:
    - implementations/app-jboot-pdv-mobile/skills/pdv-mobile-ui.md
    - implementations/app-jboot-pdv-mobile/skills/offline-first-pdv.md
    - implementations/app-jboot-pdv-mobile/skills/local-storage-contract.md
```

Se esse bloco nao for mostrado ao usuario antes da implementacao, a execucao deve ser tratada como nao aderente ao contrato, mesmo que passe em build/testes.

## Entrypoints Planejados

- `src/app/*`
- `src/navigation/*`
- `src/features/sales/*`
- `src/features/sync/*`
- `src/storage/*`
- `src/api/*`
- `src/design/*`

## Contratos

- Login/contexto via Identity Hub.
- APIs e sync via `bff-jboot-platform/modules/pdv`.
- `implementations/bff-jboot-pdv` foi origem de migracao da Sprint 1; removido em 2026-07-17, referencia historica em `implementations/bff-jboot-platform/modules/pdv/legacy-reference/bff-jboot-pdv/`.
- SQLite local para dados necessarios a venda offline.
- Identidade visual conforme `docs/design-system.md`, com componentes React Native equivalentes.

## Validacao

Quando houver codigo:

```bash
npm run type-check
npm run build
```

Validacoes futuras:

- venda offline sem rede;
- reenvio idempotente;
- reconciliacao de conflito;
- operacao em tablet e celular;
- persistencia local apos restart do app.

## Restricoes

- Este contrato e fonte de verdade para execucao neste projeto.
- Nao reutilizar componentes DOM/Next/Bootstrap/Reactstrap.
- Nao depender de internet para finalizar venda.
- Nao armazenar segredo sensivel em texto puro.
- Sync deve tolerar reenvio.
- UI deve ser otimizada para toque e operacao rapida.

## Riscos Conhecidos

- Conflitos de estoque entre offline e online.
- Duplicidade de venda/pagamento se idempotencia falhar.
- Armazenamento local exige migracoes e estrategia de versionamento.
