from __future__ import annotations

import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from temporalio.client import Client
from temporalio.exceptions import WorkflowAlreadyStartedError

from .shared.process_monitoring import ProcessMonitorInput
from .workflows.datajud_monitor_workflow import DataJudMonitorWorkflow
from .workflows.process_monitor_workflow import ProcessMonitorWorkflow, process_monitor_workflow_id

# Rotas do acompanhamento antigo do Juridico (ADR 010). Desde a Sprint 2 de
# docs/product/process-monitoring-sprints.md so resta parar workflows `juridico-datajud-monitor:*`
# ainda em execucao; a migracao (`npm run migrate:process-monitors` no BFF) usa esta rota e inicia o
# `ProcessMonitorWorkflow` equivalente. Remover junto com o `DataJudMonitorWorkflow` depois da migracao
# em todos os ambientes.
router = APIRouter(prefix="/datajud/monitors")


class StopMonitorRequest(BaseModel):
    client_id: str = Field(min_length=1, max_length=64)
    deleted: bool = False


@router.post("/{monitor_id}/stop")
async def stop_monitor(monitor_id: str, body: StopMonitorRequest, x_jboot_worker_secret: str = Header(default="")) -> dict[str, str]:
    if not x_jboot_worker_secret or x_jboot_worker_secret != os.getenv("JBOOT_JURIDICO_WORKER_INTERNAL_SECRET", ""):
        raise HTTPException(status_code=401, detail="invalid internal caller")
    client = await Client.connect(os.getenv("TEMPORAL_ADDRESS", "temporal:7233"))
    workflow_id = f"juridico-datajud-monitor:{body.client_id}:{monitor_id}"
    try:
        await client.get_workflow_handle(workflow_id).signal(DataJudMonitorWorkflow.stop, body.deleted)
    except Exception:  # workflow may already be closed; desired state is still stopped
        pass
    return {"workflow_id": workflow_id, "state": "stopping"}


# Acompanhamento de processos como capacidade independente (ADR 021). Mesmo segredo interno do BFF.
process_monitors_router = APIRouter(prefix="/process-monitors")


def _require_internal_caller(secret: str) -> None:
    if not secret or secret != os.getenv("JBOOT_JURIDICO_WORKER_INTERNAL_SECRET", ""):
        raise HTTPException(status_code=401, detail="invalid internal caller")


class StartProcessMonitorRequest(BaseModel):
    monitor_id: str = Field(min_length=1, max_length=64)
    client_id: str = Field(min_length=1, max_length=64)
    cadence_seconds: int = Field(ge=86_400, le=2_592_000)


class StopProcessMonitorRequest(BaseModel):
    client_id: str = Field(min_length=1, max_length=64)
    deleted: bool = False


@process_monitors_router.post("")
async def start_process_monitor(body: StartProcessMonitorRequest, x_jboot_worker_secret: str = Header(default="")) -> dict[str, str]:
    _require_internal_caller(x_jboot_worker_secret)
    client = await Client.connect(os.getenv("TEMPORAL_ADDRESS", "temporal:7233"))
    workflow_id = process_monitor_workflow_id(body.client_id, body.monitor_id)
    try:
        await client.start_workflow(
            ProcessMonitorWorkflow.run,
            ProcessMonitorInput(monitor_id=body.monitor_id, client_id=body.client_id, cadence_seconds=body.cadence_seconds),
            id=workflow_id,
            task_queue="juridico-scraping",
        )
    except WorkflowAlreadyStartedError:
        # Criacao, retomada ou retry do BFF e idempotente para o mesmo acompanhamento.
        pass
    return {"workflow_id": workflow_id}


@process_monitors_router.post("/{monitor_id}/stop")
async def stop_process_monitor(monitor_id: str, body: StopProcessMonitorRequest, x_jboot_worker_secret: str = Header(default="")) -> dict[str, str]:
    _require_internal_caller(x_jboot_worker_secret)
    client = await Client.connect(os.getenv("TEMPORAL_ADDRESS", "temporal:7233"))
    workflow_id = process_monitor_workflow_id(body.client_id, monitor_id)
    try:
        await client.get_workflow_handle(workflow_id).signal(ProcessMonitorWorkflow.stop, body.deleted)
    except Exception:  # workflow ja encerrado: o estado desejado continua sendo parado
        pass
    return {"workflow_id": workflow_id, "state": "stopping"}
