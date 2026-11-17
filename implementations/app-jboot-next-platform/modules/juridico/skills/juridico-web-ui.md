# Skill: Juridico Web UI

## Objetivo

Implementar telas do módulo jurídico seguindo o design system da platform.

## Entradas

- Contrato de rota e dados do BFF jurídico.
- Estado do portal (ativo/bloqueado) por tenant.

## Saidas

- Páginas em `src/app/(with-layout)/juridico/*`.
- Componentes em `src/modules/juridico/components/`.

## Falhas Esperadas

- Portal sem credenciais configuradas: exibir estado vazio com CTA de configuração.
- Portal bloqueado: exibir card com indicador visual — nunca ocultar.
