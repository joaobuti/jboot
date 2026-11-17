# Security Review: Architecture Graph Sprint 4

date: 2026-10-06
status: passed
owner: ai-security
open_items: 0
skill: docs/skills/security-checklist/SKILL.md

## Escopo

- `tools/ai/architecture-graph.py`;
- `tools/ai/architecture-graph-viewer`;
- schema, registry, Make targets e adapters de governanca.

## Checklist

### Injection

- [x] CLI nao executa conteudo de nodes/edges como comando, URL ou codigo.
- [x] Subprocess do API Graph usa argv fixo e path resolvido do repositorio.
- [x] `PORT` do runner aceita somente inteiro entre 1024 e 65535.
- [x] N/A banco/SQL: entrega nao possui persistencia.

### Access Control

- [x] Viewer e local, read-only e servido em `127.0.0.1`.
- [x] Nao existem endpoints de mutacao, login, tenant ou recurso de usuario.
- [x] N/A Identity: nao ha deploy nem acesso remoto nesta sprint.

### Dados Sensiveis

- [x] Extratores leem contracts/governance/codigo estrutural; nao leem `.env`.
- [x] Artefato nao deve conter secrets, tokens ou PII.
- [x] UI usa text nodes/React escaping e nao usa `dangerouslySetInnerHTML`.

### Mass Assignment, Rate Limit, Paginacao E SSRF

- [x] N/A: viewer nao recebe DTO, nao consulta banco e nao faz chamadas externas.
- [x] `fetch` do browser e fixo em `/graph.json`, same-origin.

### Dependencias

- [x] Dependencias fixadas no `package-lock.json`.
- [x] `npm audit --audit-level=high`: 0 vulnerabilidades.
- [x] Sigma/Graphology processam somente o JSON validado pelo loader.

### Frontend

- [x] Nenhum token em localStorage/sessionStorage.
- [x] Nenhum secret em variavel publica ou bundle.
- [x] Nenhum HTML arbitrario ou string concatenada como markup.
- [x] Viewer permanece read-only; interacoes afetam apenas estado em memoria.

### Engenharia Agentica

- [x] Conteudo do repositorio e metadata sao tratados como dados.
- [x] Tooling local e geracao sao T1; dependencia foi instalada sob autorizacao
  explicita de implementacao da sprint.
- [x] Nenhuma acao externa, deploy, banco ou comunicacao foi executada.
- [x] Attestation nao contem secrets ou PII.
- [x] `ai-graph-architect` nao recebe autoridade adicional de tool, cloud,
  banco, deploy ou acao destrutiva; stewardship nao amplia permissao.
- [x] Handoff preserva ownership: executor escreve no mesmo diff e steward
  revisa semantica/gates, evitando centralizacao e agente rogue.
- [x] Cloud sync, graph database e mudanca material de schema continuam sujeitos
  a confirmacao humana e matriz T2/T3 quando aplicavel.

## Evidencia

- unit tests Python e TypeScript;
- type-check, lint e build em Node.js 24 do container JBoot;
- dependency audit sem vulnerabilidades;
- smoke visual e interativo no browser local;
- API Graph e Architecture Graph gates aprovados.
