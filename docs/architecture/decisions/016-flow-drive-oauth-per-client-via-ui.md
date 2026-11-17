# ADR 016: Drive Do Flow Com OAuth Por Cliente Pela Tela

- Status: aprovada em 2026-10-14 (usuario: cada cliente usa o proprio Google
  Drive, conta pessoal, sem configurar chaves).
- Altera a decisao "Credencial Drive: OAuth por tenant" da ADR 015 apenas no
  modo de obter a credencial.

## Decisao

O cliente autoriza a propria conta Google pela tela do Flow (OAuth 2.0 authorization
code, `access_type=offline`, escopo `drive.file` + `openid email`) e escolhe a
pasta pelo Google Picker. O refresh token e persistido cifrado (AES-256-GCM,
chave derivada por `client_id`) na tabela do tenant. O `secret_ref` por variavel
de ambiente deixa de existir. O app OAuth e unico do JBoot.

## Consequencias

- `drive.file` e escopo nao restrito: dispensa a avaliacao de seguranca anual do
  Google, mas o app so enxerga pastas escolhidas no Picker e arquivos que ele
  criou; por isso a pasta nao pode ser informada por link.
- O callback retorna para a pagina do Flow e e finalizado por chamada autenticada;
  nao existe rota publica de callback, o que impede vincular o Drive de uma
  vitima ao tenant de outro usuario (`state` assinado e preso a tenant + usuario).
- Em modo `Testing` no Google Cloud o refresh token expira em 7 dias; clientes
  reais exigem o app publicado.
- Rotacionar `JBOOT_FLOW_DRIVE_ENCRYPTION_KEY` exige reconexao de todos os clientes.
- Arquivos ficam no Drive e na cota do proprio cliente.
