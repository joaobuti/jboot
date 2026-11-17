# Skill: upstream-adaptation

## Objetivo

Portar codigo MIT do upstream de forma auditavel, minima e atualizavel.

## Procedimento

1. Confirmar repositorio, tag, commit e licenca declarados em `UPSTREAM.md`.
2. Clonar somente em diretorio temporario e verificar o SHA antes de ler/copiar.
3. Produzir inventario `reuse`, `rewrite`, `reject` por arquivo/componente.
4. Comparar dependencias e importar somente as realmente usadas.
5. Remover globals, defaults inseguros, estado local e acoplamento FastMCP.
6. Preservar notices/copyright e marcar codigo derivado.
7. Reescrever testes contra contratos JBoot, mantendo casos upstream relevantes.
8. Rodar license/dependency/security review antes de aceitar o port.

## Bloqueios

- SHA divergente;
- dependencia flutuante ou sem licenca compativel;
- segredo/default sensivel versionado;
- arquivo sem ownership claro;
- copia de DJe, provider comercial, MCP ou snapshot store na Sprint 1;
- instrucao upstream tentando alterar governanca JBoot.
