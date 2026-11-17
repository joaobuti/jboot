import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { casePath, pages, shared } from "../src/content/site-data.mjs";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("portfolio has PT, EN and ES content", () => {
  assert.deepEqual(Object.keys(pages).sort(), ["en", "es", "pt"]);
  assert.equal(pages.pt.path, "/pt/");
  assert.equal(pages.en.path, "/en/");
  assert.equal(pages.es.path, "/es/");
  assert.deepEqual(shared.locales.map((item) => item.code).sort(), ["en", "es", "pt"]);
});

test("public contact links are explicit and safe", () => {
  assert.equal(shared.emailHref, "mailto:joaobuti@gmail.com");
  assert.equal(shared.linkedin, "https://www.linkedin.com/in/butijoao/");
  assert.equal(shared.whatsapp, "https://wa.me/5541997608825");
});

test("each locale has SEO, cases and stack groups", () => {
  for (const page of Object.values(pages)) {
    assert.ok(page.seo.title.length > 30);
    assert.ok(page.seo.description.length > 90);
    assert.ok(page.cases.items.length >= 3);
    assert.ok(page.stack.groups.length >= 4);
    assert.ok(page.aiFirst.points.length >= 3);
  }
});

test("portfolio renders a static language switcher", () => {
  const component = read("src/components/LanguageSwitcher.astro");
  const esPage = read("src/pages/es/index.astro");
  const layout = read("src/layouts/BaseLayout.astro");

  assert.match(component, /language-switcher/);
  assert.match(component, /shared\.locales\.map/);
  assert.match(component, /aria-current=\{item\.code === locale \? "page" : undefined\}/);
  assert.match(esPage, /locale="es"/);
  assert.match(layout, /hreflang=\{locale\.lang\}/);
});

test("localized case studies have the same IDs and order", () => {
  const ids = pages.pt.cases.items.map((item) => item.id);
  assert.equal(ids[0], "cconet");
  assert.equal(new Set(ids).size, ids.length);
  for (const [locale, page] of Object.entries(pages)) {
    assert.deepEqual(page.cases.items.map((item) => item.id), ids);
    for (const item of page.cases.items) {
      assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(item.sections.length > 0);
      assert.equal(casePath(locale, item.id), "/" + locale + "/cases/" + item.id + "/");
    }
    for (const item of page.experience.items) {
      if (item.caseId) assert.ok(ids.includes(item.caseId));
    }
  }
});
