# Skill: qa-web-smoke

## Uso

Use para validar a landing antes de considerar a entrega concluida.

## Smokes

```text
GET /
CTA principal aponta para /login
/ nao redireciona automaticamente para /login
pagina renderiza em mobile e desktop
assets publicos carregam
```

## Ausencia Obrigatoria

Verificar que nao existem:

- chamadas para `/api/auth`;
- chamadas para `/api/platform`;
- chamadas para `/api/juridico`;
- clients HTTP;
- hooks de auth/session;
- formulario ou coleta de dados no Sprint 1;
- analytics, pixels ou cookies de rastreamento no Sprint 1;
- secrets, tokens, tenants ou dados reais sensiveis.

## SEO Minimo

- title;
- description;
- canonical;
- Open Graph basico;
- favicon/brand asset.
