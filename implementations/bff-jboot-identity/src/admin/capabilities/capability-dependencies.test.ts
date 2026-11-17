import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { capabilityDependencyViolations } from './capability-dependencies';

const catalog = [
  { slug: 'monitoramento-processual', label: 'Monitoramento processual (DataJud)', requiresCapability: null },
  { slug: 'publicacoes-processuais', label: 'Publicações processuais (DJEN)', requiresCapability: 'monitoramento-processual' }
];

void test('DJEN com DataJud ligado passa', () => {
  assert.deepEqual(capabilityDependencyViolations(catalog, [], [
    { slug: 'monitoramento-processual', enabled: true },
    { slug: 'publicacoes-processuais', enabled: true }
  ]), []);
});

void test('ligar DJEN sem DataJud e recusado', () => {
  assert.deepEqual(capabilityDependencyViolations(catalog, [], [{ slug: 'publicacoes-processuais', enabled: true }]), [
    'Publicações processuais (DJEN) exige Monitoramento processual (DataJud)'
  ]);
});

void test('desligar DataJud com DJEN ja ligado no cliente e recusado', () => {
  const current = [{ slug: 'monitoramento-processual', enabled: true }, { slug: 'publicacoes-processuais', enabled: true }];
  assert.equal(capabilityDependencyViolations(catalog, current, [{ slug: 'monitoramento-processual', enabled: false }]).length, 1);
  assert.deepEqual(capabilityDependencyViolations(catalog, current, [
    { slug: 'monitoramento-processual', enabled: false },
    { slug: 'publicacoes-processuais', enabled: false }
  ]), []);
});
