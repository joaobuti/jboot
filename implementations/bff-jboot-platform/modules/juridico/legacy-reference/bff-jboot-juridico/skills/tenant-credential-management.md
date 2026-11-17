# Skill: tenant-credential-management

## Objetivo

Gerenciar credenciais de portais jurídicos por tenant com segurança obrigatória.

## Procedimento

1. Receber credenciais via API autenticada (usuário, senha, token, segredo TOTP).
2. Criptografar com chave derivada do `client_id` antes de persistir.
3. Nunca retornar credencial em plaintext em resposta de API.
4. Ao despachar job para worker: descriptografar em memória, incluir no payload Temporal como campo protegido, descartar da memória após envio.
5. Registrar operações de criação, atualização e uso de credencial em audit log (sem valor da credencial).

## Restrições

- Credencial nunca em log, trace ou resposta de listagem.
- Chave de criptografia não armazenada junto ao dado criptografado.
- Rotação de credencial invalida jobs pendentes do portal correspondente.
