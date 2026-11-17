import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFlowCustomerDto } from './flow-customer.dto';

void test('Flow customer DTO rejects an invalid CPF and blank name', async () => {
  const dto = plainToInstance(CreateFlowCustomerDto, {
    name: '   ',
    documentNumber: 'abc',
    officeIds: ['00000000-0000-4000-8000-000000000020']
  });
  const errors = await validate(dto);
  assert.equal(errors.some((error) => error.property === 'name'), true);
  assert.equal(errors.some((error) => error.property === 'documentNumber'), true);
});
