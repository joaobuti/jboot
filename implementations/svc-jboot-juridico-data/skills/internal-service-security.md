# Skill: internal-service-security

## Objetivo

Aplicar a fronteira s2s, SSRF protection, minimizacao de dados e erros seguros do
servico Juridico Data.

## Checklist

- JWT s2s valida issuer, signature, audience `svc:juridico-data`, expiry e caller;
- frontend e JWT de usuario nunca acessam o servico;
- CORS desabilitado; bind/ingress restrito a rede interna;
- hosts, paths e indices externos em allowlist fechada;
- request body rejeita campos extras;
- numero CNJ, partes, token, API key e response body nao aparecem em logs;
- health/readiness nao revelam configuracao ou secrets;
- limites de body, colecoes, timeout, concorrencia e rate limit configurados;
- erros seguem `application/problem+json` e nao incluem stack/raw provider;
- auditoria de dependencia sem CVE critica aberta;
- testes negativos cobrem JWT invalido, SSRF, mass assignment e sigilo.

## Saida Esperada

Checklist preenchido junto de `docs/skills/security-checklist/SKILL.md`, sem item
aberto antes de merge/deploy.
