# Skill: BYOK Credential Vault

Use ao criar ou alterar credenciais de provedores no AI Gateway.

## Procedimento

1. Ler o contrato, OpenAPI, modelo de dados e threat model da sprint.
2. Confirmar que tenant e owner vem do token e nao do request.
3. Aceitar apenas provider do catalogo executavel.
4. Cifrar com AES-256-GCM, nonce aleatorio de 96 bits e AAD versionado contendo
   id, tenant, owner, provider e versao da chave.
5. Persistir somente envelope cifrado, metadados minimos e `last4`.
6. Na revogacao, apagar ciphertext, nonce e tag.
7. Nunca retornar ou registrar plaintext; erros devem ser sanitizados.
8. Testar round-trip, adulteracao, troca de AAD, isolamento tenant/owner,
   provider bloqueado e ausencia do segredo na resposta.
9. Executar type-check, testes, lint, build e audit dentro do container.

## Bloqueios

- Provider externo sem politica de dados/modelos/DPA aprovada.
- Chave produtiva sem KMS/secret manager e rotacao definida.
