# Sprints: E-mail Do Sistema, Convite E Recuperacao De Senha

Branch: `feature/account-access-email` (a partir de
`fix/identity-client-document-mask`, que mexe na mesma tela de clientes).

```text
target_project: implementations/bff-jboot-identity, implementations/bff-jboot-platform,
                implementations/app-jboot-identity-admin, implementations/app-jboot-next-platform
execution_mode: cross_project
deployment_boundary_gate: embedded_module (classes dentro dos BFFs existentes; sem servico novo)
stack_decision: inherited_from_host (NestJS/TypeScript nos dois BFFs, Next.js nas telas)
```

## Decisoes Confirmadas — 2026-11-09

- Volume baixo: nada de servico, banco ou fila novos. Uma classe de envio
  (`MailService`, nodemailer + SMTP por env) em cada BFF: no
  `bff-jboot-platform` (Flow, PDV, Juridico usam a mesma) e no
  `bff-jboot-identity` (convite e senha). O Identity nao chama o platform: o
  "esqueci minha senha" nao pode depender dele.
- SMTP em producao: conta do dominio jboot (Google Workspace) ou Gmail, so por
  variavel de ambiente (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASS`, `SMTP_FROM`). Em dev, Mailpit.
- Cadastro do cliente: sem "Senha inicial"; e-mail do admin obrigatorio; o
  admin recebe convite com o login (documento) e link para criar a senha.
- "Esqueci minha senha" na tela de login: a pessoa informa o documento com que
  entra (CPF ou CNPJ do login, nao o CNPJ da empresa) e o link vai para o
  e-mail cadastrado nesse login.

## Regras De Seguranca

- Link de uso unico; o banco guarda so o hash SHA-256 do token. Convite vale
  72 h; recuperacao vale 1 h. Gerar um novo invalida os anteriores do mesmo
  tipo; criar a senha invalida todos.
- Conta convidada nasce `pending` e nao entra (o login ja exige `active`).
- "Esqueci minha senha" responde sempre igual, nao mostra o e-mail e tem limite
  de pedidos por documento e por IP.
- Trocar a senha encerra as sessoes registradas e os acessos do conector OAuth.
- E-mail sem senha: so login, link e validade.

## Sprint 1 — Classe De Envio Nos Dois BFFs

Estado: `concluida`.

- [x] `bff-jboot-platform`: `MailService` comum em `src/modules/shared/mail`;
  o `MailerService` do Flow passa a usar o transporte dela (sem mudar textos).
- [x] `bff-jboot-identity`: `MailService` com o mesmo contrato e as mesmas envs.
- [x] `SMTP_SECURE` (porta 465) alem de 587/STARTTLS.
- [x] Testes, `tsc`, lint.

Evidencias (2026-11-09): `MailService` em `bff-jboot-platform/src/modules/shared/mail`
e em `bff-jboot-identity/src/mail`; `MailerService` do Flow so monta textos e envia
por ela (`mailer.service.spec.ts`). Plataforma: 101 testes de automacao e kit,
`tsc` e lint limpos. Identity: `nodemailer` adicionado, `tsc` e lint limpos.

## Sprint 2 — Convite No Cadastro Do Cliente

Estado: `concluida`.

- [x] Tabela `identity_access_tokens` (hash, finalidade, validade, uso);
  migration `132_identity_access_tokens.sql` (tambem libera o motivo
  `password_reset` na revogacao de acessos OAuth).
- [x] Onboarding sem senha: identidade `pending`, sem credencial, e-mail
  obrigatorio; convite enviado depois do cadastro. Falha no envio nao desfaz o
  cadastro: a resposta traz `invite: { sent, reason }` e a tela avisa.
- [x] `POST /auth/password/check` e `POST /auth/password/set` (publicos):
  conferem o link e criam a senha; a conta passa a `active`; sessoes e acessos
  OAuth anteriores sao encerrados.
- [x] `POST /admin/identities/:id/invite`: "Reenviar convite" na tela de
  Usuarios do Identity (so conta `pending`; conta ativa recebe 409).
- [x] Tela publica "Criar senha" (`/criar-senha`) no app do Identity, onde fica
  o login de todos os usuarios (`GlobalLogin`), e nao no app da plataforma como
  previsto no plano; cadastro do cliente sem "Senha inicial" e com e-mail
  validado.
- [x] Testes, `tsc`, lint, gates, conferencia no Mailpit.

Evidencias (2026-11-09):

- Identity: 34 testes passando, 0 falhas (6 pulados com banco),
  `account-access.service.test.ts` cobre hash do token, validade de 72 h,
  conta nao pendente, sem e-mail, SMTP fora, link invalido e reuso.
- Ponta a ponta local (Identity + Mailpit): cadastro 201 com `invite.sent`,
  admin `pending`; e-mail "Seu acesso a JBoot" com login e botao; login antes
  da senha 401; `check` 200; `set` 200; reuso do link 404; login depois 201;
  reenviar convite para conta ativa 409. Cliente de teste marcado como
  excluido depois.
- App do Identity: `tsc` limpo e testes passando; arquivos novos sem erro de
  lint; os arquivos ja existentes (clientes, usuarios, libs) seguem com os erros
  de formatacao que ja tinham.
- Gates de contrato HTTP e de arquitetura passando.

## Sprint 3 — Esqueci Minha Senha

Estado: `concluida`.

- [x] `POST /auth/password/forgot` (publico): sempre 202 com a mesma resposta;
  o envio roda depois da resposta (o tempo nao revela se o login existe);
  limite de 3 links por login por hora (contagem e gravacao juntas, com trava
  por identidade) e de 10 pedidos por IP por hora; link de 1 h para o e-mail
  do login. Conta sem e-mail, bloqueada ou apagada: nada e enviado.
- [x] Link "Esqueci minha senha" na tela de login (`GlobalLogin`, app do
  Identity), tela `/esqueci-senha` com mascara de CPF/CNPJ e reuso da tela
  "Criar senha".
- [x] `JBOOT_IDENTITY_TRUST_PROXY`: atras de proxy reverso o IP real chega ao
  limite e a auditoria.
- [x] Testes, `tsc`, lint, gates, conferencia no Mailpit.

Evidencias (2026-11-09):

- Identity: 37 testes passando, 0 falhas (6 pulados com banco); novos casos
  de link de 1 h, sem cadastro, sem e-mail, bloqueado, documento invalido,
  limite por login e por IP.
- Ponta a ponta local: documento inexistente e existente respondem igual
  (202 `{"accepted":true}`); e-mail "Redefinicao de senha da JBoot" com
  validade de 1 hora; `check` devolve `password_reset`; senha antiga 401 e nova
  201 depois da troca. Achado e corrigido no teste: 4 pedidos seguidos geravam
  3 e-mails (contagem concorrente); com a trava por identidade, 2 (o limite
  certo). Clientes de teste marcados como excluidos.

## Pendencias Nao Bloqueantes

- Conta SMTP e remetente de producao (decisao do usuario: dominio jboot ou
  Gmail).
- Usuarios criados pelo admin do cliente dentro dos modulos
  (`ModuleUserManager`) ainda nascem com senha definida por quem cadastra;
  levar o convite para la fica para depois.
- E-mails do Flow seguem com o texto atual; so o transporte passa a ser comum.
