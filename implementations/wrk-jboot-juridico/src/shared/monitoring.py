from __future__ import annotations

import os
from dataclasses import dataclass

import httpx
from temporalio import activity


@dataclass
class MonitorInput:
    monitor_id: str
    client_id: str
    database_ref: str
    cadence_seconds: int


async def _service_token() -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            f"{os.getenv('JBOOT_IDENTITY_SERVICE_URL', 'http://127.0.0.1:8000')}/auth/service-token",
            json={
                "clientId": "juridico-worker",
                "clientSecret": os.environ['JBOOT_JURIDICO_WORKER_SERVICE_CLIENT_SECRET'],
                "audience": "svc:platform-api",
            },
        )
        response.raise_for_status()
        return str(response.json()['accessToken'])


@activity.defn
async def run_datajud_monitor(input: MonitorInput) -> None:
    """Legado: a execucao saiu para a capacidade `monitoramento-processual` (ADR 021, Sprint 2).

    Workflows `juridico-datajud-monitor:*` ainda vivos nao consultam mais nada; a migracao
    (`npm run migrate:process-monitors` no BFF) os para e inicia o `ProcessMonitorWorkflow`.
    """
    activity.logger.warning(
        "legacy datajud monitor tick ignored; monitor migrated to process-monitoring",
        extra={"monitor_id": input.monitor_id},
    )


@activity.defn
async def purge_expired_monitors(input: MonitorInput) -> None:
    token = await _service_token()
    async with httpx.AsyncClient(timeout=40) as client:
        response = await client.post(
            f"{os.getenv('JBOOT_PLATFORM_API_URL', 'http://127.0.0.1:8010')}/internal/juridico/datajud/acompanhamentos/purge",
            headers={"Authorization": f"Bearer {token}"},
            json={"databaseRef": input.database_ref},
        )
        response.raise_for_status()
