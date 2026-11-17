import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SignJWT } from 'jose';
import { AppConfigService } from '../../../config/app-config.service';
import { withTestDatabase, TEST_DATABASE_REF } from '../../../test/with-test-database';
import { buildRealVisibility } from '../../../test/kanban-visibility';
import { ColumnsRepository } from '../columns/columns.repository';
import { ColumnsService } from '../columns/columns.service';
import { ColumnPermissionsRepository } from '../profiles/column-permissions.repository';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CardActionsController } from './card-actions.controller';
import { CardActionsService } from './card-actions.service';
import { CardActionsRepository } from './card-actions.repository';
import { PetitionProtocolRepository } from '../initial-petitions/petition-protocol.repository';
import { CardActionHandlers } from './card-action-handlers.service';
import { CardActionsRateLimitGuard } from './card-actions-rate-limit.guard';
import { SignedKitRepository } from '../signed-kit/signed-kit.repository';

void test('HTTP + PostgreSQL: authenticated assignment -> card execution -> column movement, permissions and validation', async () => {
  await withTestDatabase(async (db, client) => {
    const clientId = randomUUID(), identityId = randomUUID(), applicationId = randomUUID();
    const boardId = randomUUID(), columnId = randomUUID(), destinationId = randomUUID(), cardId = randomUUID();
    await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'HTTP actions test', $3)`, [boardId, clientId, identityId]);
    await client.query(`INSERT INTO kanban_board_columns (id, client_id, board_id, name, position)
      VALUES ($1, $3, $4, 'Source', 0), ($2, $3, $4, 'Destination', 1)`, [columnId, destinationId, clientId, boardId]);
    await client.query(`INSERT INTO kanban_board_members (client_id, board_id, identity_id, role) VALUES ($1, $2, $3, 'board_member')`, [clientId, boardId, identityId]);
    await client.query(`INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
      VALUES ($1, $2, $3, $4, 'HTTP synthetic card', 0, $5)`, [cardId, clientId, boardId, columnId, identityId]);
    const { access, visibility, viewers } = buildRealVisibility(db);
    const columns = new ColumnsRepository(db);
    const visibleColumns = new ColumnsService(columns, new ColumnPermissionsRepository(db), access, new KanbanAuditService(db));
    const validations: unknown[][] = [];
    const signedKits = { validateFromAction: async (...args: unknown[]) => { validations.push(args); return 'Validação de assinatura iniciada.'; } };
    const service = new CardActionsService(new CardActionsRepository(db), columns, visibleColumns, access, visibility,
      new CardActionHandlers(signedKits as never), new PetitionProtocolRepository(db), viewers, new SignedKitRepository(db));
    const secret = 'synthetic-local-card-actions-test-signing-key';
    @Module({
      controllers: [CardActionsController],
      providers: [
        { provide: CardActionsService, useValue: service },
        { provide: AppConfigService, useValue: { jwtSecret: secret } },
        CardActionsRateLimitGuard
      ]
    })
    class TestActionsModule {}
    const app = await NestFactory.create(TestActionsModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    try {
      const base = `${await app.getUrl()}/kanban/boards/${boardId}`;
      const tokenFor = (scopes: string[], roles: string[] = [], tenant = clientId) => new SignJWT({
        client_id: tenant, application_id: applicationId, database_ref: TEST_DATABASE_REF, scopes, roles
      }).setProtectedHeader({ alg: 'HS256' }).setSubject(identityId).setExpirationTime('2m').sign(new TextEncoder().encode(secret));
      const master = await tokenFor(['flow:read', 'flow:admin'], ['client_admin']);
      const executor = await tokenFor(['flow:read', 'flow:actions:execute']);
      const reader = await tokenFor(['flow:read']);
      const call = (path: string, token: string | null, method = 'GET', body?: object) => fetch(`${base}${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      assert.equal((await call('/actions', null)).status, 401);
      assert.equal((await call('/actions', await tokenFor(['flow:read'], [], randomUUID()))).status, 404);
      const catalog = await (await call('/actions', master)).json() as { canConfigure: boolean; categories: { id: string }[] };
      assert.equal(catalog.canConfigure, true);
      assert.equal(catalog.categories[0].id, 'juridico');
      assert.equal((await call(`/columns/${columnId}/actions`, executor, 'PUT', { actionIds: ['monitorar'] })).status, 403);
      assert.equal((await call(`/columns/${columnId}/actions`, master, 'PUT', { actionIds: ['monitorar', 'monitorar'] })).status, 400);
      assert.equal((await call(`/columns/${columnId}/actions`, master, 'PUT', { actionIds: [], client_id: randomUUID() })).status, 400);
      assert.equal((await call(`/columns/${columnId}/actions`, master, 'PUT', { actionIds: ['unknown'] })).status, 404);
      assert.equal((await call(`/columns/${columnId}/actions`, master, 'PUT', { actionIds: ['gerar-protocolo', 'monitorar'] })).status, 204);
      assert.equal((await call(`/cards/${cardId}/actions/monitorar/execute`, reader, 'POST')).status, 403);
      const executed = await call(`/cards/${cardId}/actions/gerar-protocolo/execute`, executor, 'POST');
      assert.equal(executed.status, 200);
      assert.equal((await executed.json() as { message: string }).message, 'backend acao Gerar Protocolo');
      // Monitorar e acao de tela (Sprint 2): o endpoint generico recusa sem gravar execucao.
      const dialog = await call(`/cards/${cardId}/actions/monitorar/execute`, executor, 'POST');
      assert.equal(dialog.status, 400);
      assert.equal((await dialog.json() as { code: string }).code, 'card_action_requires_dialog');
      assert.equal((await call(`/cards/${cardId}/actions/gerar-protocolo/execute`, master, 'POST')).status, 200);
      await client.query(`UPDATE kanban_cards SET board_column_id = $1 WHERE id = $2`, [destinationId, cardId]);
      assert.equal((await call(`/cards/${cardId}/actions/gerar-protocolo/execute`, executor, 'POST')).status, 409);
      assert.equal((await call(`/columns/${destinationId}/actions`, master, 'PUT', { actionIds: ['gerar-protocolo'] })).status, 204);
      assert.equal((await call(`/cards/${cardId}/actions/gerar-protocolo/execute`, executor, 'POST')).status, 200);
      assert.equal((await call(`/columns/${destinationId}/actions`, master, 'PUT', { actionIds: [] })).status, 204);
      assert.equal((await call(`/cards/${cardId}/actions/gerar-protocolo/execute`, executor, 'POST')).status, 409);

      // Validar assinatura (flow-signed-kit S5): so com agente; a execucao leva o agente e quem configurou.
      const agentId = randomUUID();
      const withoutAgent = await call(`/columns/${destinationId}/actions`, master, 'PUT', { actionIds: ['validar-assinatura'] });
      assert.equal(withoutAgent.status, 400);
      assert.equal((await withoutAgent.json() as { code: string }).code, 'card_action_config_required');
      assert.equal((await call(`/columns/${destinationId}/actions`, master, 'PUT', {
        actionIds: ['validar-assinatura'], configs: [{ actionId: 'validar-assinatura', agentId }]
      })).status, 204);
      const listed = await (await call('/actions', executor)).json() as {
        assignments: Array<{ actionId: string; agentId: string | null; configuredByCurrentUser: boolean }>; availableCardIds: Record<string, string[]>
      };
      assert.deepEqual(listed.assignments.filter(a => a.actionId === 'validar-assinatura'), [{ columnId: destinationId, actionId: 'validar-assinatura', agentId, configuredByCurrentUser: true }]);
      assert.deepEqual(listed.availableCardIds['validar-assinatura'], [], 'card sem kit assinado');
      assert.equal((await call(`/cards/${cardId}/actions/validar-assinatura/execute`, reader, 'POST')).status, 403);
      const validated = await call(`/cards/${cardId}/actions/validar-assinatura/execute`, executor, 'POST');
      assert.equal(validated.status, 200);
      assert.deepEqual(validations.map(args => [args[1], args[2], args[3]]), [[boardId, cardId, { agentId, executorIdentityId: identityId }]]);
      const stored = await client.query(`SELECT config FROM kanban_column_actions WHERE board_id = $1 AND column_id = $2`, [boardId, destinationId]);
      assert.deepEqual(stored.rows.map(row => row.config), [{ agentId }]);
    } finally { await app.close(); }
  });
});
