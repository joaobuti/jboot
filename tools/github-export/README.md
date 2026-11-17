# JBoot

A multi-tenant platform with shared identity and modular business products,
built and operated by [João Buti](https://portfolio.jboot.com.br/en/) through
JBoot Studio. Its Flow legal automation module runs in production for one
external customer.

This repository is the public copy of the working monorepo. Most contracts,
architecture records and code comments are written in Portuguese; this README
is the English entry point. A Portuguese version is in
[README.pt-BR.md](README.pt-BR.md).

## What is in here

Every project and module declares a maturity state in its contract. The
states, from the lifecycle in
[docs/architecture/implementation-lifecycle.md](docs/architecture/implementation-lifecycle.md):

- `planned`: scope and contract exist, no working runtime.
- `scaffolded`: toolchain and structure exist, no complete working flow.
- `in_progress`: a partial working implementation with known blocking work.
- `functional`: the main flow has code and reproducible automated validation.
- `production_ready`: full definition of done, with operation and rollback
  validated.

No project is marked `production_ready` yet. Production readiness is assessed
separately from `functional`: Flow runs in production while its contract
still records that assessment as pending.

### Projects

| Area | Project | Stack | Status |
|---|---|---|---|
| Identity | `bff-jboot-identity`: tenants, users, entitlements, JWT sessions per application | NestJS, PostgreSQL | `functional` |
| Identity | `app-jboot-identity-admin`: global admin and post-login application selector | Next.js, React | `functional` |
| Platform | `bff-jboot-platform`: modular monolith for business products | NestJS, PostgreSQL | `functional` |
| Platform | `app-jboot-next-platform`: modular web front end for the same products | Next.js, React | `functional` |
| Legal | `wrk-jboot-juridico`: court-system workers orchestrated by Temporal | Python, Playwright | `functional` |
| Legal | `svc-jboot-juridico-data`: internal API over official court data (DataJud) | Python | `functional` |
| AI | `svc-jboot-ai-gateway`: encrypted credentials, versioned agents, execution against Anthropic and OpenAI | NestJS | `in_progress` |
| Payments | `svc-jboot-payments`: provider-neutral billing service | Go | `in_progress` |
| Fiscal | `svc-jboot-fiscal`: reusable fiscal document service; blocked until external tax-authority certification | Laravel | `scaffolded` |
| Point of sale | `app-jboot-pdv-mobile`: offline-first mobile point of sale | React Native, Expo | `planned` |
| Operations | `ops-jboot-observability`: OpenTelemetry and Grafana LGTM | Docker | `functional` |
| Public sites | `site-jboot-landing`, `site-joao-buti-portfolio` | Next.js, Astro | `functional` |

### Platform modules

A module is selected at login and its session carries that application in
the JWT, so the navigation and API scopes are limited to it. Modules live in
`implementations/bff-jboot-platform/modules` and
`implementations/app-jboot-next-platform/modules`.

| Module | Purpose | Status |
|---|---|---|
| `kanban` | Flow: boards and cards with real-time sync and configurable AI automations per column | `functional` |
| `pdv` | Point of sale | `functional` |
| `juridico` | Legal intake, court credentials, case lookups and monitoring through Temporal workers | `functional` |
| `catalog` | Products and categories | `functional` |
| `establishment-customers` | End customers of a tenant's business, shared by point of sale and ordering | `functional` |
| `platform-files` | File upload, metadata and signed retrieval for other modules | `functional` |
| `process-monitoring` | Court case monitoring from official sources (DataJud, DJEN) | `in_progress` |
| `domain-integrations` | Cross-module flows, such as court data feeding Flow cards | `in_progress` |
| `comanda` | Self-service table ordering by QR code | `scaffolded` |

## Engineering approach

- **Contracts before code.** Every project and module has a contract with its
  stack, boundaries, entry points and validation commands. AI agents and
  people read the contract of the target before changing it.
- **Governed AI-assisted engineering.** 13 blocking CI controls check the
  governance contract, agent context freshness, behavioral evaluations
  (positive and negative), execution records and adapter coverage
  (`make ai-conformance`).
- **Architecture graph.** Nodes and relationships are generated from
  contracts, architecture records and the API catalog
  (`tools/ai/architecture-graph.py`). A CI gate fails when the graph and its
  sources disagree, such as an edge pointing to a missing node.
- **HTTP contract graph.** Routes, DTOs and their consumers are extracted from
  the code (`tools/ai/api-graph.py`), so an API change lists the affected
  callers before it is made.
- **Architecture decisions** are recorded in
  [docs/architecture/decisions](docs/architecture/decisions).

## Running it

Development runs in Docker; tests, type checks and builds run inside the
`jboot` container, not on the host.

```bash
make code-up TARGET=<project-or-module>
make ai-check
```

Production runs on a single VPS behind Caddy with automatic TLS, deployed
from GitLab CI by image tag (`deploy/vps`).

## About this public copy

This copy is exported from the private GitLab repository by
`tools/github-export/export.sh`, with its own history. The export removes
personal data, test spreadsheets and the commercial UI template the web apps
are based on (Velzon), including its demo pages. Parts of the web apps still
use that template's components and assets.

## Contact

[Portfolio](https://portfolio.jboot.com.br/en/) ·
[LinkedIn](https://www.linkedin.com/in/butijoao/)
