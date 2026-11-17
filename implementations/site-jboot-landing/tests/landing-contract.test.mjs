import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = relativePath => readFileSync(join(root, relativePath), "utf8");

function sourceFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

test("build permanece estatico e independente de image runtime", () => {
  const config = read("next.config.ts");

  assert.match(config, /output:\s*["']export["']/);
  assert.match(config, /trailingSlash:\s*true/);
  assert.match(config, /unoptimized:\s*true/);
});

test("CTA e metadata respeitam o contrato publico", () => {
  const routes = read("src/lib/routes.ts");
  const content = read("src/content/landing-content.ts");
  const hubContent = read("src/content/hub-home-content.ts");
  const layout = read("src/app/layout.tsx");

  assert.match(routes, /login:.*NEXT_PUBLIC_IDENTITY_LOGIN_URL.*admin\.jboot\.com\.br\/login/);
  assert.match(content, /href:\s*routes\.login/);
  assert.match(hubContent, /href:\s*routes\.login/);
  assert.match(layout, /canonical:\s*siteUrl/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /https:\/\/jboot\.com\.br\//);
});

test("home hub publica seletor de idioma para PT, EN e ES", () => {
  const content = read("src/content/hub-home-content.ts");
  const header = read("src/components/hub/HubHeader.tsx");
  const enPage = read("src/app/en/page.tsx");
  const esPage = read("src/app/es/page.tsx");

  assert.match(content, /code:\s*"pt".*href:\s*"\/"/s);
  assert.match(content, /code:\s*"en".*href:\s*"\/en\/"/s);
  assert.match(content, /code:\s*"es".*href:\s*"\/es\/"/s);
  assert.match(header, /ai-language-switcher/);
  assert.match(header, /aria-current=\{item\.code === locale \? "page" : undefined\}/);
  assert.match(enPage, /<HubLanding locale="en" \/>/);
  assert.match(esPage, /<HubLanding locale="es" \/>/);
});

test("landing nao incorpora auth, coleta ou APIs privadas", () => {
  const content = sourceFiles(join(root, "src"))
    .filter(path => /\.(ts|tsx|js|jsx)$/.test(path))
    .map(path => readFileSync(path, "utf8"))
    .join("\n");

  assert.doesNotMatch(content, /from\s+["']axios["']/);
  assert.doesNotMatch(content, /fetch\s*\(\s*["'`]\/api\/(auth|platform|juridico)/);
  assert.doesNotMatch(content, /<form\b/i);
  assert.doesNotMatch(content, /(google-analytics|gtag\s*\(|facebook pixel)/i);
});

test("nova home usa a adaptacao hub e v6 preserva a versao anterior", () => {
  const home = read("src/app/page.tsx");
  const v6Home = read("src/app/v6/page.tsx");
  const v6Layout = read("src/app/v6/layout.tsx");
  const hubContent = read("src/content/hub-home-content.ts");

  assert.match(home, /HubLanding/);
  assert.doesNotMatch(home, /AiFirstLanding/);
  assert.match(v6Home, /AiFirstLanding/);
  assert.doesNotMatch(v6Home, /HubLanding/);
  assert.match(v6Layout, /robots:\s*\{\s*index:\s*false/);
  assert.match(v6Layout, /https:\/\/jboot\.com\.br\/v6\//);
  assert.match(hubContent, /href:\s*routes\.login/);
});

test("nova home hub nao publica claims simuladas ou produtos inexistentes", () => {
  const content = read("src/content/hub-home-content.ts");

  assert.doesNotMatch(content, /ISO 27001|99,95%|R\$ 1,2M|68% de resolu[cç][aã]o|em 90 dias|oito produtos|oito plataformas/i);
  assert.match(content, /PDV/);
  assert.match(content, /Jur[ií]dico/);
  assert.match(content, /Identity/);
});

test("home hub usa a marca clara e v6 preserva a marca escura", () => {
  const hubLanding = read("src/components/hub/HubLanding.tsx");
  const previousLanding = read("src/components/ai-first/AiFirstLanding.tsx");
  const v6Home = read("src/app/v6/page.tsx");

  assert.match(hubLanding, /jb-cyan-white\.png/);
  assert.match(previousLanding, /jb-cyan\.jpg/);
  assert.doesNotMatch(previousLanding, /jb-cyan-white\.png/);
  assert.match(v6Home, /AiFirstLanding/);
});

test("pipeline lista artefatos antecipadamente e conclui cada check por etapa", () => {
  const pipeline = read("src/components/ai-first/AgentPipeline.tsx");
  const styles = read("src/app/home.css");

  assert.match(pipeline, /const artifactSteps = script\.flatMap/);
  assert.match(pipeline, /const completed = index > artifact\.stepIndex/);
  assert.match(pipeline, /ai-artifact__check/);
  assert.match(pipeline, /stack-fit-gate\.md/);
  assert.match(pipeline, /human-decision\.json/);
  assert.match(pipeline, /execution-preflight\.json/);
  assert.match(pipeline, /review-gate\.md/);
  assert.match(pipeline, /evidencias · riscos · aprovacao pendente/);
  assert.doesNotMatch(pipeline, /Nenhum artefato ainda/);
  assert.match(styles, /\.ai-artifacts \{ align-self: start;/);
  assert.match(styles, /\.ai-artifact\.is-complete \.ai-artifact__check/);
});

test("pipeline pausa no gate humano e torna a ativacao de skills condicional visivel", () => {
  const pipeline = read("src/components/ai-first/AgentPipeline.tsx");

  assert.match(pipeline, /const \[waitingApproval, setWaitingApproval\]/);
  assert.match(pipeline, /const approveAndContinue/);
  assert.match(pipeline, /Aprovar stack simulada/);
  assert.match(pipeline, /confirmacao humana obrigatoria/);
  assert.match(pipeline, /platform-crud-ui selecionada somente se houver CRUD administrativo/);
  assert.match(pipeline, /security-checklist exigida se endpoints, auth, queries ou storage forem afetados/);
  assert.match(pipeline, /Fan-out → Agent Backend \+ Agent Frontend com skills aplicaveis/);
});

test("bloco de arquitetura de IA e unico e reutilizado por todas as versoes", () => {
  const sharedSection = read("src/components/shared/AiArchitectureSection.tsx");
  const hubLanding = read("src/components/hub/HubLanding.tsx");
  const aiFirstLanding = read("src/components/ai-first/AiFirstLanding.tsx");
  const versionPages = ["v2", "v3", "v4", "v5"].map(version =>
    read(`src/app/${version}/page.tsx`),
  );
  const styles = read("src/app/home.css");

  assert.match(sharedSection, /id="pipeline"/);
  assert.match(sharedSection, /<AgentPipeline autoStart/);
  assert.match(sharedSection, /jb-ai-architecture-block/);
  assert.match(hubLanding, /<AiArchitectureSection content=\{content\.pipeline\} locale=\{locale\} \/>/);
  assert.match(aiFirstLanding, /<AiArchitectureSection \/>/);
  versionPages.forEach(page => assert.match(page, /<AiArchitectureSection \/>/));
  assert.match(styles, /\.jb-ai-architecture-block \{/);
});
