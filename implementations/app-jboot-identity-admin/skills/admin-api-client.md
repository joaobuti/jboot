# Skill Local: admin-api-client

## Uso

Aplicar quando tela admin consumir ou alterar endpoints do `bff-jboot-identity`.

## Padrao

- Usar `src/lib/admin-api.ts` como fronteira HTTP.
- Tipar request e response.
- Preservar cookie/sessao admin conforme `src/lib/jboot-identity.ts`.
- Tratar status HTTP explicitamente quando houver acao destrutiva ou validacao de formulario.
- Se o endpoint exigir `global_admin` e `identity:admin`, nao criar workaround no frontend.

## Cross-Project

Se o frontend precisar de contrato novo:

1. declarar endpoint, metodo, request, response e erros;
2. atualizar o BFF usando o contrato do projeto backend;
3. atualizar o client frontend;
4. validar frontend e backend.

