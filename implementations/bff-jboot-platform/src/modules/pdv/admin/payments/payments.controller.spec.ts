import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY } from '../guards/scope.guard';
import { PaymentsController } from './payments.controller';

void test('PaymentsController protects read and write connection operations', () => {
  const reflector = new Reflector();
  const read = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [PaymentsController.prototype.get, PaymentsController]);
  const write = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [PaymentsController.prototype.configure, PaymentsController]);
  assert.deepEqual(read, ['pdv:sales:read']);
  assert.deepEqual(write, ['pdv:sales:write']);

	const refundRead = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [PaymentsController.prototype.listRefunds, PaymentsController]);
	const refundWrite = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [PaymentsController.prototype.requestRefund, PaymentsController]);
	const refundComplete = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [PaymentsController.prototype.completeRefund, PaymentsController]);
	const reconciliationRead = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [PaymentsController.prototype.listReconciliation, PaymentsController]);
	assert.deepEqual(refundRead, ['pdv:sales:read']);
	assert.deepEqual(refundWrite, ['pdv:sales:write']);
	assert.deepEqual(refundComplete, ['pdv:sales:write']);
	assert.deepEqual(reconciliationRead, ['pdv:sales:read']);
});

void test('PaymentsController derives refund operator from authenticated context', async () => {
  const calls: unknown[] = [];
  const payments = {
    requestRefund: async (input: unknown) => {
      calls.push(input);
      return { status: 'requested' };
    },
  };
  const controller = new PaymentsController(payments as never);
  const request = { pdvContext: { clientId: 'client-1', identityId: 'operator-from-jwt' } } as never;

  await controller.requestRefund({
    chargeId: '9ba2594a-9af8-4a73-89dc-1f1855666ed3',
    amountMinor: 100,
    reason: 'solicitacao do cliente',
    idempotencyKey: 'refund-key-123',
  }, request);

  assert.deepEqual(calls, [{
    clientId: 'client-1', operatorIdentityId: 'operator-from-jwt',
    chargeId: '9ba2594a-9af8-4a73-89dc-1f1855666ed3', amountMinor: 100,
    reason: 'solicitacao do cliente', idempotencyKey: 'refund-key-123',
  }]);
});

void test('PaymentsController forwards only provider fields after administrator confirmation', async () => {
  const calls: unknown[] = [];
  const payments = {
    configureInfinitePayConnection: async (...args: unknown[]) => {
      calls.push(args);
      return { status: 'verified' };
    },
  };
  const controller = new PaymentsController(payments as never);
  const request = { pdvContext: { clientId: 'client-1' } } as never;

  await controller.configure({
    publicIdentifier: '$merchant',
    secretRef: 'vault://payments/key',
    validationConfirmed: true,
  }, request);

  assert.deepEqual(calls, [[
    'client-1',
    { publicIdentifier: '$merchant', secretRef: 'vault://payments/key' },
  ]]);
});
