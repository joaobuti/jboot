import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EprocSessionService } from './eproc-session.service';

type WorkerGet = (path: string) => Promise<unknown>;
type WorkerPost = (path: string, body?: unknown) => Promise<unknown>;
type EprocSessionServiceHarness = {
  workerGet: WorkerGet;
  workerPost: WorkerPost;
};

interface RunPendingWorkerBody {
  batch_size: number;
  max_consultations: number;
}

void test('EprocSessionService.getActiveQueryJobStatus resumes active job without running process', async () => {
  const calls: Array<{ method: 'GET' | 'POST'; path: string }> = [];
  const service = new EprocSessionService(
    {} as never,
    {} as never,
    {
      connectionUrls: {
        'postgres.juridico': 'postgresql://jboot:jboot@postgres:5432/juridico-test',
      },
      workerJuridicoUrl: 'http://worker.test',
    } as never,
    {} as never,
  );
  const serviceHarness = service as unknown as EprocSessionServiceHarness;

  serviceHarness.workerGet = async (path: string) => {
    calls.push({ method: 'GET', path });
    return {
      job_id: 'job-1',
      status: 'running',
      total: 10,
      processed: 2,
      success_count: 1,
      error_count: 1,
      processes_received: 3,
      processes_persisted: 2,
      processes_filtered: 1,
      last_error: 'ultimo erro',
      running_in_process: calls.length > 1,
    };
  };
  serviceHarness.workerPost = async (path: string) => {
    calls.push({ method: 'POST', path });
    return { ok: true };
  };

  const result = await service.getActiveQueryJobStatus({
    clientId: 'client-1',
    identityId: 'identity-1',
    applicationId: 'juridico-app',
    databaseRef: 'postgres.juridico',
    scopes: [],
    roles: [],
  });

  assert.equal(result?.jobId, 'job-1');
  assert.equal(result?.runningInProcess, true);
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST', 'GET']);
  assert.match(calls[0].path, /^\/eproc\/query-jobs\/active\?/);
  assert.match(calls[1].path, /^\/eproc\/query-jobs\/job-1\/resume\?/);
  assert.match(calls[2].path, /^\/eproc\/query-jobs\/job-1\?/);
});

void test('EprocSessionService.getActiveQueryJobStatus returns null when worker has no active job', async () => {
  const service = new EprocSessionService(
    {} as never,
    {} as never,
    {
      connectionUrls: {},
      workerJuridicoUrl: 'http://worker.test',
    } as never,
    {} as never,
  );
  const serviceHarness = service as unknown as EprocSessionServiceHarness;

  serviceHarness.workerGet = async () => ({ status: 'none' });

  const result = await service.getActiveQueryJobStatus({
    clientId: 'client-1',
    identityId: 'identity-1',
    applicationId: 'juridico-app',
    databaseRef: 'postgres.juridico',
    scopes: [],
    roles: [],
  });

  assert.equal(result, null);
});

void test('EprocSessionService.runPendingConsultations limits routines to ten consultations each', async () => {
  const captured: { body?: RunPendingWorkerBody } = {};
  const service = new EprocSessionService(
    {} as never,
    {} as never,
    {
      connectionUrls: {
        'postgres.juridico': 'postgresql://jboot:jboot@postgres:5432/juridico-test',
      },
      workerJuridicoUrl: 'http://worker.test',
    } as never,
    {} as never,
  );
  const serviceHarness = service as unknown as EprocSessionServiceHarness;

  serviceHarness.workerGet = async () => ({ status: 'active', session_id: 'session-1' });
  serviceHarness.workerPost = async (_path: string, body: unknown) => {
    captured.body = body as RunPendingWorkerBody;
    return { job_id: 'job-1', status: 'queued', total: 50 };
  };

  const result = await service.runPendingConsultations(
    {
      clientId: 'client-1',
      identityId: 'identity-1',
      applicationId: 'juridico-app',
      databaseRef: 'postgres.juridico',
      scopes: [],
      roles: [],
    },
    { queryRuns: 5 },
  );

  assert.equal(result.jobId, 'job-1');
  assert.equal(captured.body?.batch_size, 1);
  assert.equal(captured.body?.max_consultations, 50);
});

void test('EprocSessionService.runPendingConsultations caps routines at 250', async () => {
  const captured: { body?: RunPendingWorkerBody } = {};
  const service = new EprocSessionService(
    {} as never,
    {} as never,
    {
      connectionUrls: {
        'postgres.juridico': 'postgresql://jboot:jboot@postgres:5432/juridico-test',
      },
      workerJuridicoUrl: 'http://worker.test',
    } as never,
    {} as never,
  );
  const serviceHarness = service as unknown as EprocSessionServiceHarness;

  serviceHarness.workerGet = async () => ({ status: 'active', session_id: 'session-1' });
  serviceHarness.workerPost = async (_path: string, body: unknown) => {
    captured.body = body as RunPendingWorkerBody;
    return { job_id: 'job-1', status: 'queued', total: 2500 };
  };

  await service.runPendingConsultations(
    {
      clientId: 'client-1',
      identityId: 'identity-1',
      applicationId: 'juridico-app',
      databaseRef: 'postgres.juridico',
      scopes: [],
      roles: [],
    },
    { queryRuns: 300 },
  );

  assert.equal(captured.body?.max_consultations, 2500);
});

void test('EprocSessionService.cancelQueryJob cancels worker job and returns updated status', async () => {
  const calls: Array<{ method: 'GET' | 'POST'; path: string }> = [];
  const service = new EprocSessionService(
    {} as never,
    {} as never,
    {
      connectionUrls: {
        'postgres.juridico': 'postgresql://jboot:jboot@postgres:5432/juridico-test',
      },
      workerJuridicoUrl: 'http://worker.test',
    } as never,
    {} as never,
  );
  const serviceHarness = service as unknown as EprocSessionServiceHarness;

  serviceHarness.workerPost = async (path: string) => {
    calls.push({ method: 'POST', path });
    return { job_id: 'job-1', status: 'cancelled', cancelled: true };
  };
  serviceHarness.workerGet = async (path: string) => {
    calls.push({ method: 'GET', path });
    return {
      job_id: 'job-1',
      status: 'cancelled',
      total: 10,
      processed: 4,
      success_count: 4,
      error_count: 0,
      processes_received: 8,
      processes_persisted: 2,
      processes_filtered: 6,
      last_error: 'Cancelado manualmente pelo usuario',
      running_in_process: false,
    };
  };

  const result = await service.cancelQueryJob(
    {
      clientId: 'client-1',
      identityId: 'identity-1',
      applicationId: 'juridico-app',
      databaseRef: 'postgres.juridico',
      scopes: [],
      roles: [],
    },
    'job-1',
  );

  assert.equal(result.status, 'cancelled');
  assert.deepEqual(calls.map((call) => call.method), ['POST', 'GET']);
  assert.match(calls[0].path, /^\/eproc\/query-jobs\/job-1\/cancel\?/);
  assert.match(calls[1].path, /^\/eproc\/query-jobs\/job-1\?/);
});
