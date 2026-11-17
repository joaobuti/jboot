# ADR 003: JBoot Platform Modular Monolith

## Status

Aceita como direcao arquitetural para produtos web/backend multi-tenant.

## Contexto

A arquitetura inicial do PDV foi criada com projetos separados:

- `bff-jboot-pdv`
- `app-jboot-pdv-web`
- `app-jboot-pdv-mobile`
- `svc-jboot-fiscal`

Apos revisao de infra, economia de codigo, economia operacional e coesao de login/contexto, foi identificada uma alternativa mais adequada para produtos web/backend que compartilham autenticacao, tenant context, autorizacao, layout e contratos operacionais.

## Decisao

Adotar uma arquitetura de plataforma modular:

```text
bff-jboot-identity
  -> autenticacao global, tenants, apps, tokens, contratos de acesso

bff-jboot-platform
  -> backend modular monolith de produtos
     modules/pdv
     modules/erp
     modules/hospital
     modules/billing

app-jboot-next-platform
  -> frontend web modular em React + Next.js + TypeScript
     modules/pdv
     modules/erp
     modules/hospital

app-jboot-pdv-mobile
  -> app mobile/tablet separado por requisito offline-first

svc-jboot-fiscal
  -> servico fiscal separado por risco, reuso e regulacao
```

## Regras

- `bff-jboot-identity` permanece separado e nao recebe dominios de produto.
- `bff-jboot-platform` consome o JWT/contexto do Identity Hub.
- Produtos web/backend vivem como modulos internos da platform quando compartilharem stack e contexto operacional.
- Cada platform tem agents/skills globais de stack/projeto.
- Cada modulo tem agents/skills especificos de dominio.
- Mobile offline-first permanece separado quando exigir runtime, storage, deploy ou UX distintos.
- Fiscal permanece servico separado.

## Hierarquia De Agents E Skills

```text
docs/agents/orchestration/*
  -> PO, PE, Architect, governanca e decisoes

implementations/bff-jboot-platform/agents/*
implementations/bff-jboot-platform/skills/*
  -> stack/projeto backend platform

implementations/bff-jboot-platform/modules/<module>/agents/*
implementations/bff-jboot-platform/modules/<module>/skills/*
  -> dominio especifico do modulo

implementations/app-jboot-next-platform/agents/*
implementations/app-jboot-next-platform/skills/*
  -> stack/projeto web platform

implementations/app-jboot-next-platform/modules/<module>/agents/*
implementations/app-jboot-next-platform/modules/<module>/skills/*
  -> UI/contratos especificos do modulo
```

## Racional

- Reduz duplicacao de auth, tenant context, guards, interceptors, clientes HTTP e layout.
- Reduz custo de infra e deploy nos produtos web/backend com stack comum.
- Mantem Identity Hub pequeno e critico.
- Mantem fiscal separado por risco regulatorio.
- Mantem mobile separado por offline-first e runtime proprio.
- Permite extrair um modulo para servico proprio futuramente se carga, risco ou acoplamento justificarem.

## Consequencias

- Os contratos antigos de PDV web/backend passam a ser considerados origem de migracao, nao destino final.
- Novas implementacoes web/backend devem preferir `bff-jboot-platform` e `app-jboot-next-platform` quando a stack for compativel.
- Toda demanda deve declarar se atinge a platform global ou um modulo especifico.
- O PE deve ativar agents globais da platform e agents do modulo quando houver implementacao.

## Riscos

- Modular monolith exige disciplina forte para evitar acoplamento entre modulos.
- Deploy da platform afeta todos os modulos internos.
- Modulos com carga ou risco alto podem precisar ser extraidos.
- Contratos internos precisam ser claros para evitar acesso direto indevido entre dominios.
