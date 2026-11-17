# Agent: Juridico API Client

## Responsabilidade

Contratos HTTP com o `bff-jboot-platform/modules/juridico`.

## Regras

- Toda chamada HTTP ao BFF jurídico passa por `src/modules/juridico/lib/juridico-api.ts`.
- Auth via cookie `authUser` (padrão da platform); fallback para `juridicoAccessToken`.
- Nunca expor credenciais de portal em log ou resposta de API.
- Tipos explícitos para request e response de cada endpoint.
