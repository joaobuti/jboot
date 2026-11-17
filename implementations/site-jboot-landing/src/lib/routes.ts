export const routes = {
  home: "/",
  // Producao: admin.jboot.com.br/login (subdominio proprio na Configr, sem
  // reverse proxy unificando dominios -- caminho relativo "/login" nao
  // existe sob jboot.com.br). Localmente, sobrescrito via
  // NEXT_PUBLIC_IDENTITY_LOGIN_URL em .env.local (ex: http://localhost:3000/login).
  login: process.env.NEXT_PUBLIC_IDENTITY_LOGIN_URL || "https://admin.jboot.com.br/login",
  solutions: "#solucoes",
  v2: "/v2/",
  v3: "/v3/",
  v4: "/v4/",
  v5: "/v5/",
  v6: "/v6/",
} as const;
