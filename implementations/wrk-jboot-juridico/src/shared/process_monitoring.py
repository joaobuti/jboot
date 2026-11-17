"""Acompanhamento de processos como capacidade independente (ADR 021).

O worker agenda e dispara a rota interna do modulo `process-monitoring` do BFF. Nao acessa banco nem
DataJud; o banco do acompanhamento e unico, entao a entrada nao carrega `database_ref`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx
from temporalio import activity
from temporalio.exceptions import ApplicationError

from .monitoring import _service_token


# Fila so das consultas ao DataJud (Sprint 4 de process-monitoring-sprints.md): uma por vez e com
# intervalo minimo entre inicios, para nao repassar ao DataJud o pico de uma importacao em lote.
PROCESS_MONITORING_TASK_QUEUE = "process-monitoring"


def process_monitoring_max_concurrency() -> int:
    return max(1, int(os.getenv("JBOOT_PROCESS_MONITORING_MAX_CONCURRENCY", "1")))


def process_monitoring_rate_per_second() -> float:
    """Inicios de consulta por segundo na fila inteira (1.0 = intervalo minimo de 1 s)."""
    return max(0.01, float(os.getenv("JBOOT_PROCESS_MONITORING_RATE_PER_SECOND", "1")))


# Fila das publicacoes do DJEN (ADR 022): separada da do DataJud, para a lentidao de uma fonte nao
# atrasar a outra. O DJEN responde em menos de 1 s; o ritmo protege o limite da API publica.
PROCESS_PUBLICATIONS_TASK_QUEUE = "process-publications"


def process_publications_max_concurrency() -> int:
    return max(1, int(os.getenv("JBOOT_PROCESS_PUBLICATIONS_MAX_CONCURRENCY", "1")))


def process_publications_rate_per_second() -> float:
    return max(0.01, float(os.getenv("JBOOT_PROCESS_PUBLICATIONS_RATE_PER_SECOND", "2")))


# Resposta do BFF que outra tentativa nao muda: processo nao encontrado, sigiloso ou numero invalido.
# Excesso de pedidos (429) e indisponibilidade (5xx) tentam de novo.
_FINAL_STATUSES = {400, 403, 404, 422}


@dataclass
class ProcessMonitorInput:
    monitor_id: str
    client_id: str
    cadence_seconds: int


def _platform_api_url() -> str:
    return os.getenv("JBOOT_PLATFORM_API_URL", "http://127.0.0.1:8010")


@activity.defn
async def run_process_monitor(input: ProcessMonitorInput) -> None:
    token = await _service_token()
    info = activity.info()
    workflow_run_id = info.workflow_run_id or "unknown"
    # O BFF espera ate 70 s pela consulta em segundo plano (limite de 60 s no servico de dados).
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            f"{_platform_api_url()}/internal/process-monitoring/monitors/{input.monitor_id}/runs",
            headers={"Authorization": f"Bearer {token}", "Idempotency-Key": f"{workflow_run_id}:{info.activity_id}"},
            json={
                "clientId": input.client_id,
                "workflowRunId": workflow_run_id,
                "scheduledAt": info.scheduled_time.isoformat() if info.scheduled_time else "1970-01-01T00:00:00Z",
            },
        )
        if response.status_code in _FINAL_STATUSES:
            raise ApplicationError(f"process monitor run final status {response.status_code}", non_retryable=True)
        response.raise_for_status()


@activity.defn
async def purge_process_monitors(input: ProcessMonitorInput) -> None:
    token = await _service_token()
    async with httpx.AsyncClient(timeout=40) as client:
        response = await client.post(
            f"{_platform_api_url()}/internal/process-monitoring/monitors/purge",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        )
        response.raise_for_status()


@dataclass
class ProcessMonitorPlan:
    active: bool
    datajud: bool
    djen: bool


@activity.defn
async def plan_process_monitor(input: ProcessMonitorInput) -> ProcessMonitorPlan:
    """Ciclo diario (ADR 022): o BFF diz quais fontes venceram, pela frequencia gravada no banco."""
    token = await _service_token()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{_platform_api_url()}/internal/process-monitoring/monitors/{input.monitor_id}/plan",
            headers={"Authorization": f"Bearer {token}"},
            json={"clientId": input.client_id},
        )
        response.raise_for_status()
        body = response.json()
    return ProcessMonitorPlan(active=bool(body.get("active")), datajud=bool(body.get("datajud")), djen=bool(body.get("djen")))


@activity.defn
async def run_process_publications(input: ProcessMonitorInput) -> None:
    """Consulta ao DJEN do acompanhamento (fila `process-publications`)."""
    token = await _service_token()
    info = activity.info()
    workflow_run_id = info.workflow_run_id or "unknown"
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            f"{_platform_api_url()}/internal/process-monitoring/monitors/{input.monitor_id}/publication-runs",
            headers={"Authorization": f"Bearer {token}", "Idempotency-Key": f"{workflow_run_id}:{info.activity_id}"},
            json={
                "clientId": input.client_id,
                "workflowRunId": workflow_run_id,
                "scheduledAt": info.scheduled_time.isoformat() if info.scheduled_time else "1970-01-01T00:00:00Z",
            },
        )
        if response.status_code in _FINAL_STATUSES:
            raise ApplicationError(f"process publications run final status {response.status_code}", non_retryable=True)
        response.raise_for_status()
