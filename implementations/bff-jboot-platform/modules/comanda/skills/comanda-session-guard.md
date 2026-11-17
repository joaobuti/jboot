# Skill: comanda-session-guard

## Objetivo

Padronizar a emissao, validacao e invalidacao da sessao publica do cliente na comanda, sem depender do Identity Hub.

## Entradas

- Token do QR de mesa (`JBOOT_COMANDA_QR_SECRET`), sem expiracao por tempo, com `token_version` de `comanda_tables` para revogacao granular.
- Telefone OU CPF informado pelo cliente na abertura/retomada.
- Token de sessao ativo (`JBOOT_COMANDA_SESSION_SECRET`), quando existente, no header/cookie.

## Saidas

- `POST /comanda/public/sessions`: resolve/cria `establishment_customer`, resolve/abre `comanda`, emite token de sessao (~8h).
- `POST /comanda/public/sessions/refresh`: sliding expiration.
- Guard (`ComandaSessionGuard`) valida assinatura do JWT de sessao E releitura de `comandas.status` no banco a cada mutacao — sessao com JWT valido mas comanda `fechada` e rejeitada.

## Falhas Esperadas

- Token de QR com `token_version` divergente do registro atual em `comanda_tables`: `401`, mesa precisa de novo QR.
- Sessao valida mas comanda ja `fechada`: `401`, cliente precisa abrir nova sessao (novo fluxo de telefone/CPF).
- Telefone/CPF invalido: `422`, nao emite sessao.
