# Skill: Juridico API Client

## Objetivo

Consumir endpoints do `bff-jboot-platform/modules/juridico` com tipos explícitos e tratamento de erro.

## Entradas

- `NEXT_PUBLIC_JBOOT_PLATFORM_API_URL` (padrão: `http://127.0.0.1:8010`).
- Cookie `authUser` da platform ou `juridicoAccessToken`.

## Saidas

- Funções tipadas exportadas por `src/modules/juridico/lib/juridico-api.ts`.

## Falhas Esperadas

- `401`: token ausente ou expirado — relançar erro para tratamento na camada de UI.
- `403`: portal não contratado — tratar como estado bloqueado, não como erro fatal.
- Rede indisponível: relançar erro com mensagem descritiva.
