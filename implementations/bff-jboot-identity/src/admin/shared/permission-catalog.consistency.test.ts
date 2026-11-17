import * as assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

/**
 * Toda permissao que o codigo da plataforma exige tem que estar no catalogo
 * (`application_permission_catalog`), senao o admin do cliente nao a recebe no cadastro
 * (docs/product/tenant-isolation-sprints.md, Sprint 0.1). Fora: `flow:connector:*` (OAuth do
 * conector Claude, nao de usuario).
 */
const repo = resolve(__dirname, '../../../../..');
const platformSrc = join(repo, 'implementations/bff-jboot-platform/src');
const migrations = join(repo, 'docker/postgres/init');
const SCOPE = /["'`]((?:flow|pdv|juridico|ai|users)(?::[a-z_]+)+)["'`]/g;
const IGNORED = /^flow:connector:/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

test('toda permissao exigida pela plataforma esta no catalogo', { skip: !existsSync(platformSrc) && 'repositorio completo ausente' }, () => {
  const required = new Set<string>();
  for (const file of walk(platformSrc).filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(SCOPE)) if (!IGNORED.test(match[1])) required.add(match[1]);
  }
  const catalog = new Set<string>();
  for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql'))) {
    const sql = readFileSync(join(migrations, file), 'utf8');
    if (!sql.includes('application_permission_catalog')) continue;
    // Dois formatos: tupla de VALUES ('flow', 'scope', 'x', ...) e SELECT id, 'scope', 'x', ...
    for (const match of sql.matchAll(/'scope', '([^']+)'/g)) catalog.add(match[1]);
  }
  const missing = [...required].filter((scope) => !catalog.has(scope)).sort();
  assert.deepEqual(missing, [], `fora do catalogo: ${missing.join(', ')}`);
  assert.ok(required.size > 10);
});
