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

| Area | Project | Stack |
|---|---|---|
| Identity | `bff-jboot-identity`: tenants, users, entitlements, JWT sessions per application | NestJS, PostgreSQL |
| Identity | `app-jboot-identity-admin`: global admin and post-login application selector | Next.js, React |
| Platform | `bff-jboot-platform`: modular monolith for business products | NestJS, PostgreSQL |
| Platform | `app-jboot-next-platform`: modular web front end for the same products | Next.js, React |
| AI | `svc-jboot-ai-gateway`: encrypted credentials, versioned agents, execution against Anthropic and OpenAI | NestJS |
| Legal | `wrk-jboot-juridico`: court-system workers orchestrated by Temporal | Python, Playwright |
| Payments | `svc-jboot-payments`: provider-neutral billing service | Go |
| Fiscal | `svc-jboot-fiscal`: reusable fiscal document service | Laravel |
| Operations | `ops-jboot-observability`: OpenTelemetry and Grafana LGTM | Docker |
| Public sites | `site-jboot-landing`, `site-joao-buti-portfolio` | Next.js, Astro |

Platform modules (`implementations/bff-jboot-platform/modules`) include the
Flow kanban with AI automations, point of sale, process monitoring with
official court data, customer records and file storage. A module is selected
at login and its session carries that application in the JWT, so the
navigation and API scopes are limited to it.

Each project declares a maturity state in its `PROJECT_CONTRACT.md`
(`planned`, `scaffolded`, `in_progress`, `functional`, `production_ready`).
The presence of code does not mean a project is production ready; the
inventory is in [implementations/README.md](implementations/README.md).

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
