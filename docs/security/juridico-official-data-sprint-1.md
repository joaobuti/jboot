# Security Checklist — Juridico Official Data Sprint 1

Data: 2026-08-27. Escopo: Identity service token, BFF DataJud, servico Python,
auditoria PostgreSQL e client web.

## Resultado

`status: approved`, sem item bloqueante aberto.

### Injection

- [x] Migration e repository usam parametros; nenhum input entra por concatenacao SQL.
- [x] Nenhum comando de sistema recebe input HTTP.

### Access Control

- [x] Browser acessa somente o BFF com JWT `app:juridico`, issuer valido e scope `juridico:read`.
- [x] BFF usa `client_id` e `database_ref` exclusivamente do contexto autenticado.
- [x] Servico aceita somente JWT `service_access`, audience `svc:juridico-data` e caller `platform-api`.
- [x] DTOs de entrada e saida sao explicitos; campos extras sao rejeitados.

### Dados Sensiveis

- [x] Numero CNJ, partes, token, API key e body upstream nao entram em logs.
- [x] Auditoria persiste apenas HMAC-SHA-256 versionado do numero processual.
- [x] API key, credenciais s2s e chave HMAC existem somente em ambiente/secret.
- [x] Processo com `nivelSigilo > 0` e bloqueado antes do retorno.

### Mass Assignment, Limites E SSRF

- [x] Pydantic `extra=forbid` e `class-validator` limitam payloads.
- [x] Servico limita body a 4 KiB, colecoes, concorrencia, cadencia, timeout e tentativas.
- [x] Emissao de token s2s limita tentativas invalidas por IP.
- [x] Catalogo e finito; nao requer paginacao. Consulta retorna um unico processo.
- [x] Host, path e indice DataJud derivam de allowlist local; URL do usuario e impossivel.

### Dependencias E Stack

- [x] `pip-audit --skip-editable`: nenhuma vulnerabilidade conhecida.
- [x] `pnpm audit --prod --audit-level critical`: nenhuma vulnerabilidade critica apos `swiper 12.2.0`.
- [x] `npm audit --omit=dev --audit-level=critical`: nenhuma vulnerabilidade critica em Identity/BFF.
- [x] Achados Node altos/moderados sao transitivos, preexistentes e nao foram introduzidos pela sprint; atualizar Nest/Swagger/Multer em manutencao propria.
- [x] Comunicacao externa DataJud exige HTTPS; CORS nao e habilitado no servico interno.
- [x] Frontend nao usa `localStorage`, `dangerouslySetInnerHTML` ou porta `8030`.

### Engenharia Agentica

- [x] Upstream tratado como nao confiavel, fixado por tag/SHA e inventariado em `UPSTREAM.md`.
- [x] Clone ocorreu somente em diretorio temporario; FastMCP/DJe/comercial foram rejeitados.
- [x] Acoes e ferramentas seguiram a matriz; nenhum secret/PII foi versionado ou incluido na attestation.
- [x] Validacoes e provenance sao evidencias executadas, sem metricas fabricadas.

## Evidencia Executavel

- 12 testes Python; Ruff, mypy e pyright aprovados no container.
- 11 testes Identity e 177 testes Platform aprovados; lint, type-check e build aprovados.
- 16 testes frontend, type-check e build aprovados.
- smoke s2s real: Identity emitiu token curto e o servico aceitou o token no catalogo.
- migrations `050` e `051` aplicadas com sucesso no PostgreSQL local.
