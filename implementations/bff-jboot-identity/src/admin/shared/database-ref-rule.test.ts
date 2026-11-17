import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { expectedDatabaseRef, isSupportedIsolation, refFollowsRule } from './database-ref-rule';
import { toView } from '../client-databases/client-databases.service';

const APP = '87366c9f-0781-4eb3-883a-6c3e76fa40cb';
const CLIENT = '5bc0a44b-7fb0-4abb-8846-5324f2d6feb8';
const shared = { id: 'r1', database_id: 'db-1', isolation_strategy: 'shared_db', connection_name: 'postgres.kanban', default_database_name: 'jboot_kanban_demo_dev' };
const dedicated = { ...shared, isolation_strategy: 'dedicated_database' };

test('regra -> registro esperado: compartilhado ativo no banco padrao; dedicado fica em criacao', () => {
  assert.deepEqual(expectedDatabaseRef(shared, APP, CLIENT), {
    databaseId: 'db-1', strategy: 'shared_db', connectionName: 'postgres.kanban', databaseName: 'jboot_kanban_demo_dev',
    schemaName: null, status: 'active', metadata: {}
  });
  const ded = expectedDatabaseRef(dedicated, APP, CLIENT);
  assert.equal(ded?.databaseName, 'app_87366c9f_c_5bc0a44b');
  assert.equal(ded?.status, 'provisioning');
  assert.equal(expectedDatabaseRef({ ...shared, isolation_strategy: 'none' }, APP, CLIENT), null);
  assert.equal(isSupportedIsolation('shared_db'), true);
  assert.equal(isSupportedIsolation('dedicated_database'), false);
});

test('caso Edervandes: registro dedicado em criacao com regra compartilhada pode ser refeito', () => {
  const current = { id: 'ref', databaseId: 'db-1', strategy: 'dedicated_db', databaseName: 'app_87366c9f_c_5bc0a44b', schemaName: null, status: 'provisioning' };
  assert.equal(refFollowsRule(current, expectedDatabaseRef(shared, APP, CLIENT)), false);
  const view = toView({ clientId: CLIENT, clientName: 'X', applicationId: APP, applicationSlug: 'flow', applicationName: 'Flow', rule: shared, current });
  assert.equal(view.followsRule, false);
  assert.equal(view.canApply, true);
});

test('registro igual a regra nao oferece acao; regra nao suportada nao pode ser aplicada', () => {
  const ok = { id: 'ref', databaseId: 'db-1', strategy: 'shared_db', databaseName: 'jboot_kanban_demo_dev', schemaName: null, status: 'active' };
  assert.equal(toView({ clientId: CLIENT, clientName: 'X', applicationId: APP, applicationSlug: 'flow', applicationName: 'Flow', rule: shared, current: ok }).canApply, false);
  const stuck = toView({ clientId: CLIENT, clientName: 'X', applicationId: APP, applicationSlug: 'flow', applicationName: 'Flow', rule: dedicated, current: null });
  assert.equal(stuck.followsRule, false);
  assert.equal(stuck.ruleSupported, false);
  assert.equal(stuck.canApply, false);
});

test('registro ativo em outro banco nao pode ser refeito (os dados do cliente estao la)', () => {
  const elsewhere = { id: 'ref', databaseId: 'db-9', strategy: 'shared_db', databaseName: 'banco_antigo', schemaName: null, status: 'active' };
  const view = toView({ clientId: CLIENT, clientName: 'X', applicationId: APP, applicationSlug: 'flow', applicationName: 'Flow', rule: shared, current: elsewhere });
  assert.equal(view.canApply, false);
  assert.equal(view.blockedReason, 'data_in_other_database');
  // So o rotulo difere (dedicado -> compartilhado no mesmo banco): pode corrigir no proprio registro.
  const relabel = { id: 'ref', databaseId: 'db-1', strategy: 'dedicated_db', databaseName: 'jboot_kanban_demo_dev', schemaName: null, status: 'active' };
  assert.equal(toView({ clientId: CLIENT, clientName: 'X', applicationId: APP, applicationSlug: 'flow', applicationName: 'Flow', rule: shared, current: relabel }).canApply, true);
});
