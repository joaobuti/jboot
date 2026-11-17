# Candidatura JBoot — Sign In With ChatGPT

Rascunho para revisao humana. Nao enviado. Data: 2026-10-15.

Formulario oficial: https://openai.com/form/sign-in-with-chatgpt-interest/

## Campos

- Work email: a informar pelo responsavel.
- First name / Last name: a informar pelo responsavel.
- Company name: confirmar razao/nome empresarial do contratante do programa.
- Website URL: confirmar dominio publico oficial do produto.
- Job title: a informar pelo responsavel, se aplicavel.
- Capability: **Sign in and ChatGPT plan use for AI requests**.

## Descricao Proposta Do Produto

JBoot is a paid, remotely hosted, multi-tenant business application. Its Flow
module manages Kanban workflows and JBoot-owned, user-configured AI agents.
Each version fixes a provider, model, prompt, input policy and an allowlist of
strictly typed tools. The prompt may ask the model to select and sequence one or
more allowed tools, but it cannot expand their authority. Users already
authenticate with JBoot.

We would like to make an explicitly authorized ChatGPT connection the primary
execution mode so eligible Plus subscribers can use their ChatGPT plan for
eligible requests. Supplying an OpenAI API key would remain an optional,
separately selected mode. The connection would be linked to the existing tenant
and user, with encrypted token storage, revocation, usage controls and no
automatic fallback to API-key billing. JBoot would not collect OpenAI passwords
or browser cookies.

The subscriber can configure a Kanban rule to run one of these agents when a
card enters or leaves a column. Depending on the agent contract, JBoot may send
an allowlisted snapshot of card/customer data and selected private attachments.
After strict schema validation and application-side reauthorization, JBoot—not
the model—executes each requested tool, for example appending card text,
updating allowlisted workflow fields, or rendering and attaching a generated
document. Execution is asynchronous, tenant-scoped, idempotent and auditable.
During development the project operator will designate their own eligible
account. In production each tenant will designate and explicitly authorize its
own responsible account; grants are never shared across tenants.

We also need confirmation whether approved plan usage can cover asynchronous,
server-initiated workflow automations configured by the subscriber, or whether
requests must be initiated interactively while the subscriber is present.

## Questoes Para O Programa

1. Can JBoot's paid, remotely hosted multi-tenant backend be approved for ChatGPT
   plan usage, in addition to identity-only sign-in?
2. Are user-configured asynchronous automations allowed? What consent and
   presence requirements apply?
3. What client registration, callback, scopes, host/account/workspace binding,
   refresh token and server-side storage contract applies to this deployment?
4. Which models, API fields, quotas and recovery rules apply to partner apps?
5. What data-processing terms and retention requirements apply?
6. May private file inputs be uploaded with purpose `user_data` by an approved
   background execution, and what deletion/retention guarantees apply?

Nao inventar e-mail, dominio, volume, usuarios, aprovacao ou dados empresariais
para preencher o formulario. Envio externo depende dos dados e autorizacao do
responsavel; a aprovacao de implementacao nao comprova admissao da OpenAI.
