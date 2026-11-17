# Skill: playwright-portal-pattern

## Objetivo

Padronizar navegação, autenticação e extração de dados em portais jurídicos com Playwright.

## Procedimento

1. Instanciar browser em contexto isolado por execução (sem compartilhamento de sessão entre tenants).
2. Executar `authenticate()` conforme estratégia do portal (user_pass, token, 2fa).
3. Navegar para página de consulta.
4. Aguardar elemento esperado — nunca sleep fixo; usar `wait_for_selector` ou `wait_for_load_state`.
5. Extrair dados via seletores declarados no adapter (não inline).
6. Normalizar resultado via `src/shared/parser/`.
7. Fechar contexto e browser ao fim da execução.

## Restrições

- Nunca reutilizar contexto de browser entre tenants diferentes.
- Seletores declarados em constante ou arquivo de configuração do adapter, não hardcoded inline.
- Capturas de screenshot apenas em modo debug; nunca em produção com dados reais.
- Timeout máximo configurável por portal via variável de ambiente.
