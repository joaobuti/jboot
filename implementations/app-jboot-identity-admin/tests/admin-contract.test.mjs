import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = relativePath => readFileSync(join(root, relativePath), "utf8");

test("rotas administrativas contratadas possuem paginas", () => {
  const routes = ["dashboard", "onboarding-clientes", "usuarios", "apps", "databases", "app-databases"];

  for (const route of routes) {
    assert.equal(
      existsSync(join(root, "src", "app", "(with-layout)", route, "page.tsx")),
      true,
      `pagina ausente para /${route}`,
    );
  }
});

test("menu principal aponta para as rotas administrativas canonicas", () => {
  const menu = read("src/layouts/Layouts/LayoutMenuData.tsx");

  for (const route of ["/dashboard", "/onboarding-clientes", "/usuarios", "/apps", "/databases", "/app-databases"]) {
    assert.match(menu, new RegExp(`link:\\s*[\"']${route.replace("/", "\\/")}[\"']`));
  }
  assert.doesNotMatch(menu, /link:\s*["']\/identity\/clientes["']/);
});

test("integracoes administrativas permanecem centralizadas e autenticadas", () => {
  const api = read("src/lib/admin-api.ts");

  assert.match(api, /authorization:\s*`Bearer \$\{token\(\)\}`/);
  assert.match(api, /NEXT_PUBLIC_JBOOT_IDENTITY_API_URL/);
  assert.match(api, /async function request<T>/);
  assert.doesNotMatch(api, /localStorage/);
});

test("retorno pos-login so aceita o consentimento OAuth do Flow", () => {
  const login = read("src/components/auth/GlobalLogin.tsx");
  const identity = read("src/lib/jboot-identity.ts");
  assert.match(login, /resolveConsentReturnUrl\(session, returnTo\) \?\?\s+resolvePostLoginUrl\(session\)/);
  assert.match(identity, /applicationSlug !== "flow"/);
  assert.match(identity, /target\.origin === platform\.origin &&\s+target\.pathname === "\/oauth\/consentimento"/);
});
