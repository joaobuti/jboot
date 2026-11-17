from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from typing import Any

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .crypto import decrypt_session
from .session_db import get_active_session, update_phase
from .setup import run_eproc_setup

log = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "JBOOT_JURIDICO_DATABASE_URL",
    "postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev",
)

app = FastAPI(title="jboot-juridico-worker-api", docs_url=None, redoc_url=None)
QUERY_BATCH_TIMEOUT_SECONDS = int(os.getenv("EPROC_QUERY_BATCH_TIMEOUT_SECONDS", "240"))

# In-memory registry of running setup tasks: setup_id → asyncio.Task
_setup_tasks: dict[str, asyncio.Task[Any]] = {}
_query_job_tasks: dict[str, asyncio.Task[Any]] = {}
_enrichment_tasks: dict[str, asyncio.Task[Any]] = {}


@app.on_event("startup")
async def _resume_pending_enrichment_jobs() -> None:
    conn: asyncpg.Connection = await asyncpg.connect(DATABASE_URL)
    try:
        await _ensure_queue_schema(conn)
        rows = await conn.fetch(
            """SELECT DISTINCT client_id
               FROM juridico_eproc_process_enrichment_jobs
               WHERE status = 'pending'
                  OR (status = 'running' AND locked_at < now() - interval '15 minutes')"""
        )
    finally:
        await conn.close()

    for row in rows:
        _ensure_enrichment_worker(DATABASE_URL, str(row["client_id"]))


def _track_query_job(job_id: str, task: asyncio.Task[Any]) -> None:
    _query_job_tasks[job_id] = task

    def _done(done_task: asyncio.Task[Any]) -> None:
        _query_job_tasks.pop(job_id, None)
        try:
            done_task.result()
        except asyncio.CancelledError:
            log.warning("eProc query job %s cancelled", job_id)
        except Exception:
            log.exception("eProc query job %s crashed", job_id)

    task.add_done_callback(_done)


def _track_enrichment(client_id: str, task: asyncio.Task[Any]) -> None:
    _enrichment_tasks[client_id] = task

    def _done(done_task: asyncio.Task[Any]) -> None:
        _enrichment_tasks.pop(client_id, None)
        try:
            done_task.result()
        except asyncio.CancelledError:
            log.warning("eProc enrichment worker cancelled")
        except Exception:
            log.exception("eProc enrichment worker crashed")

    task.add_done_callback(_done)


# ── Models ────────────────────────────────────────────────────────────────────

class StartSetupRequest(BaseModel):
    setup_id: str
    client_id: str
    username: str
    password: str
    database_url: str
    preferred_profile: str | None = None


class Submit2FARequest(BaseModel):
    code: str


class SelectProfileRequest(BaseModel):
    sigla: str


class ConsultRequest(BaseModel):
    client_id: str
    cpf: str
    session_state_json: str


class ConsultBatchRequest(BaseModel):
    client_id: str
    cpfs: list[str]
    session_state_json: str


class StartQueryJobRequest(BaseModel):
    client_id: str
    database_url: str
    cpf: str | None = None
    keyword: str | None = None
    portal_slug: str = "eproc"
    batch_size: int = 25
    max_consultations: int | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/eproc/setup")
async def start_setup(body: StartSetupRequest) -> dict[str, str]:
    """BFF calls this to start an interactive session setup."""
    conn: asyncpg.Connection = await asyncpg.connect(body.database_url)
    try:
        await conn.execute(
            """INSERT INTO juridico_eproc_sessions (id, client_id, phase)
               VALUES ($1, $2, 'pending')""",
            body.setup_id,
            body.client_id,
        )
    finally:
        await conn.close()

    task = asyncio.create_task(
        run_eproc_setup(
            setup_id=body.setup_id,
            client_id=body.client_id,
            username=body.username,
            password=body.password,
            database_url=body.database_url,
            preferred_profile=body.preferred_profile,
        )
    )
    _setup_tasks[body.setup_id] = task
    task.add_done_callback(lambda t: _setup_tasks.pop(body.setup_id, None))

    return {"setup_id": body.setup_id}


@app.get("/eproc/setup/{setup_id}/status")
async def get_setup_status(setup_id: str, database_url: str) -> dict[str, Any]:
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        row = await conn.fetchrow(
            "SELECT phase, available_profiles, error_message FROM juridico_eproc_sessions WHERE id = $1",
            setup_id,
        )
    finally:
        await conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Setup not found")

    profiles = json.loads(row["available_profiles"]) if row["available_profiles"] else None
    return {
        "phase": row["phase"],
        "available_profiles": profiles,
        "error_message": row["error_message"],
    }


@app.post("/eproc/setup/{setup_id}/2fa")
async def submit_2fa(setup_id: str, body: Submit2FARequest, database_url: str) -> dict[str, bool]:
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        result = await conn.execute(
            "UPDATE juridico_eproc_sessions SET totp_code = $2, updated_at = now() WHERE id = $1",
            setup_id,
            body.code,
        )
    finally:
        await conn.close()

    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Setup not found")
    return {"ok": True}


@app.post("/eproc/setup/{setup_id}/profile")
async def select_profile(setup_id: str, body: SelectProfileRequest, database_url: str) -> dict[str, bool]:
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        result = await conn.execute(
            "UPDATE juridico_eproc_sessions SET selected_profile = $2, updated_at = now() WHERE id = $1",
            setup_id,
            body.sigla,
        )
    finally:
        await conn.close()

    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Setup not found")
    return {"ok": True}


@app.get("/eproc/session")
async def get_session_status(client_id: str, database_url: str) -> dict[str, Any]:
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        row = await get_active_session(conn, client_id)
    finally:
        await conn.close()

    if not row:
        return {"status": "none"}
    return {"status": "active", "session_id": str(row["id"]), "created_at": str(row["created_at"])}


@app.post("/eproc/consult")
async def consult_cpf(body: ConsultRequest) -> dict[str, Any]:
    """Run a single CPF consultation using a saved session."""
    from ...shared.contracts import ConsultaInput
    from ..eproc.adapter import EprocTjscAdapter

    adapter = EprocTjscAdapter()
    input_data = ConsultaInput(
        portal_id="eproc",
        client_id=body.client_id,
        credential_encrypted="",
        query_type="cpf",
        query_value=body.cpf,
        session_state_json=body.session_state_json,
    )
    try:
        processos = await adapter.execute(input_data)
        return {
            "status": "success",
            "processes": [
                {
                    "numero": p.numero,
                    "tribunal": p.tribunal,
                    "assunto": p.assunto,
                    "data_distribuicao": p.data_distribuicao,
                    **p.raw,
                }
                for p in processos
            ],
        }
    except Exception as exc:
        return {"status": "error", "error": str(exc), "processes": []}


@app.post("/eproc/consult-batch")
async def consult_batch(body: ConsultBatchRequest) -> dict[str, Any]:
    """Run multiple CPF consultations reusing a single browser/context."""
    from ...shared.contracts import ConsultaInput
    from ..eproc.adapter import EprocTjscAdapter

    adapter = EprocTjscAdapter()
    inputs = [
        ConsultaInput(
            portal_id="eproc",
            client_id=body.client_id,
            credential_encrypted="",
            query_type="cpf",
            query_value=cpf,
            session_state_json=body.session_state_json,
        )
        for cpf in body.cpfs
    ]
    try:
        results = await adapter.execute_batch(inputs)
        return {"status": "success", "results": results}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "results": []}


@app.post("/eproc/query-jobs")
async def start_query_job(body: StartQueryJobRequest) -> dict[str, Any]:
    if body.portal_slug != "eproc":
        raise HTTPException(status_code=400, detail=f"Unsupported portal {body.portal_slug}")

    conn: asyncpg.Connection = await asyncpg.connect(body.database_url)
    try:
        await _ensure_queue_schema(conn)
        portal = await conn.fetchrow("SELECT id FROM juridico_portals WHERE slug = $1 LIMIT 1", body.portal_slug)
        if not portal:
            raise HTTPException(status_code=404, detail="Portal eProc not found")

        await _cancel_active_query_jobs(conn, body.client_id, str(portal["id"]))
        await _ensure_missing_consultations(conn, body.client_id, portal["id"])
        job_id = str(uuid.uuid4())
        total = await _enqueue_job(
            conn,
            job_id=job_id,
            client_id=body.client_id,
            portal_id=str(portal["id"]),
            cpf=body.cpf,
            keyword=body.keyword,
            max_consultations=body.max_consultations,
        )
        should_start = total > 0
        return_status = "queued" if total > 0 else "completed"
    finally:
        await conn.close()

    if should_start:
        task = asyncio.create_task(_run_query_job(body.database_url, job_id, max(1, min(body.batch_size, 10))))
        _track_query_job(job_id, task)

    return {"job_id": job_id, "status": return_status, "total": total}


@app.get("/eproc/query-jobs/active")
async def get_active_query_job(database_url: str, client_id: str, portal_slug: str = "eproc") -> dict[str, Any]:
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        portal = await conn.fetchrow("SELECT id FROM juridico_portals WHERE slug = $1 LIMIT 1", portal_slug)
        if not portal:
            raise HTTPException(status_code=404, detail="Portal not found")

        row = await conn.fetchrow(
            """SELECT id, status, total, processed, success_count, error_count,
                      processes_received, processes_persisted, processes_filtered,
                      last_error, started_at, finished_at, created_at, updated_at
               FROM juridico_eproc_query_jobs
               WHERE client_id = $1
                 AND portal_id = $2
                 AND status IN ('queued', 'running')
                 AND EXISTS (
                   SELECT 1
                   FROM juridico_captacao_consultations cc
                   WHERE cc.job_id = juridico_eproc_query_jobs.id
                     AND cc.status IN ('pending', 'running')
                 )
               ORDER BY created_at DESC
               LIMIT 1""",
            client_id,
            portal["id"],
        )
    finally:
        await conn.close()

    if not row:
        return {"status": "none"}

    return _query_job_response(row, str(row["id"]) in _query_job_tasks)


@app.get("/eproc/query-jobs/{job_id}")
async def get_query_job(job_id: str, database_url: str, client_id: str) -> dict[str, Any]:
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        row = await conn.fetchrow(
            """SELECT id, status, total, processed, success_count, error_count,
                      processes_received, processes_persisted, processes_filtered,
                      last_error, started_at, finished_at, created_at, updated_at
               FROM juridico_eproc_query_jobs
               WHERE id = $1 AND client_id = $2""",
            job_id,
            client_id,
        )
    finally:
        await conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Query job not found")

    return _query_job_response(row, job_id in _query_job_tasks)


def _query_job_response(row: asyncpg.Record, running_in_process: bool) -> dict[str, Any]:
    return {
        "job_id": str(row["id"]),
        "status": row["status"],
        "total": row["total"],
        "processed": row["processed"],
        "success_count": row["success_count"],
        "error_count": row["error_count"],
        "processes_received": row["processes_received"],
        "processes_persisted": row["processes_persisted"],
        "processes_filtered": row["processes_filtered"],
        "last_error": row["last_error"],
        "started_at": str(row["started_at"]) if row["started_at"] else None,
        "finished_at": str(row["finished_at"]) if row["finished_at"] else None,
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
        "running_in_process": running_in_process,
    }


@app.post("/eproc/query-jobs/{job_id}/resume")
async def resume_query_job(job_id: str, database_url: str, client_id: str, batch_size: int = 1) -> dict[str, Any]:
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        row = await conn.fetchrow(
            """SELECT id, status
               FROM juridico_eproc_query_jobs
               WHERE id = $1 AND client_id = $2""",
            job_id,
            client_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Query job not found")
        if row["status"] in ("completed", "failed", "cancelled"):
            return {"job_id": job_id, "status": row["status"], "resumed": False}
        await conn.execute(
            """UPDATE juridico_captacao_consultations
               SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = now()
               WHERE job_id = $1
                 AND status = 'running'
                 AND locked_at < now() - interval '1 minute'""",
            job_id,
        )
    finally:
        await conn.close()

    if job_id not in _query_job_tasks:
        task = asyncio.create_task(_run_query_job(database_url, job_id, max(1, min(batch_size, 1))))
        _track_query_job(job_id, task)

    return {"job_id": job_id, "status": "running", "resumed": True}


@app.post("/eproc/query-jobs/{job_id}/cancel")
async def cancel_query_job(job_id: str, database_url: str, client_id: str) -> dict[str, Any]:
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        row = await conn.fetchrow(
            """SELECT id, status
               FROM juridico_eproc_query_jobs
               WHERE id = $1 AND client_id = $2""",
            job_id,
            client_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Query job not found")
        if row["status"] in ("completed", "failed", "cancelled"):
            return {"job_id": job_id, "status": row["status"], "cancelled": False}

        task = _query_job_tasks.pop(job_id, None)
        if task:
            task.cancel()
        await _cancel_job_in_progress(conn, job_id, "Cancelado manualmente pelo usuario")
    finally:
        await conn.close()

    return {"job_id": job_id, "status": "cancelled", "cancelled": True}


async def _run_query_job(database_url: str, job_id: str, batch_size: int) -> None:
    worker_id = f"eproc-worker-{os.getpid()}"
    conn: asyncpg.Connection = await asyncpg.connect(database_url)
    try:
        job = await conn.fetchrow("SELECT client_id, keyword_filter FROM juridico_eproc_query_jobs WHERE id = $1", job_id)
        if not job:
            return
        session = await get_active_session(conn, str(job["client_id"]))
        if not session:
            await _fail_job(conn, job_id, "Sessao eProc nao configurada")
            return
        session_json = decrypt_session(str(job["client_id"]), bytes(session["session_state_enc"]))
        await conn.execute(
            """UPDATE juridico_eproc_query_jobs
               SET status = 'running', worker_id = $2, started_at = COALESCE(started_at, now()), updated_at = now()
               WHERE id = $1""",
            job_id,
            worker_id,
        )
    finally:
        await conn.close()

    from ...shared.contracts import ConsultaInput
    from ..eproc.adapter import EprocTjscAdapter

    adapter = EprocTjscAdapter()
    try:
        while True:
            conn = await asyncpg.connect(database_url)
            try:
                job_status = await conn.fetchval("SELECT status FROM juridico_eproc_query_jobs WHERE id = $1", job_id)
                if job_status in ("completed", "failed", "cancelled") or job_status is None:
                    return
                rows = await _claim_consultations(conn, job_id, worker_id, max(1, min(batch_size, 100)))
                if not rows:
                    await _finish_job_if_done(conn, job_id)
                    return
                keyword = await conn.fetchval("SELECT keyword_filter FROM juridico_eproc_query_jobs WHERE id = $1", job_id)
            finally:
                await conn.close()

            inputs = [
                ConsultaInput(
                    portal_id="eproc",
                    client_id=str(row["client_id"]),
                    credential_encrypted="",
                    query_type="cpf",
                    query_value=row["cpf"],
                    session_state_json=session_json,
                )
                for row in rows
            ]

            try:
                batch = await asyncio.wait_for(
                    adapter.execute_batch(inputs),
                    timeout=QUERY_BATCH_TIMEOUT_SECONDS,
                )
            except Exception as exc:
                conn = await asyncpg.connect(database_url)
                try:
                    message = _query_job_error_message(exc)
                    if "eProc session expired" in message:
                        await conn.execute(
                            """UPDATE juridico_eproc_sessions
                               SET phase = 'failed', error_message = $2, updated_at = now()
                               WHERE client_id = (SELECT client_id FROM juridico_eproc_query_jobs WHERE id = $1)
                                 AND phase = 'completed'""",
                            job_id,
                            message,
                        )
                    await _mark_batch_error(conn, job_id, rows, message)
                    if "eProc session expired" in message:
                        await _fail_job(conn, job_id, message)
                        return
                    log.warning("Falha transitoria no lote eProc job=%s: %s", job_id, message)
                    continue
                finally:
                    await conn.close()

            results_by_cpf = {str(result.get("cpf")): result for result in batch}
            conn = await asyncpg.connect(database_url)
            try:
                for row in rows:
                    result = results_by_cpf.get(row["cpf"])
                    if not result or result.get("status") == "error":
                        await _mark_consultation_error(
                            conn,
                            job_id,
                            str(row["id"]),
                            str((result or {}).get("error") or "Worker nao retornou resultado para o CPF"),
                        )
                        continue

                    try:
                        stats = await _persist_processes(
                            conn,
                            client_id=str(row["client_id"]),
                            cpf=str(row["cpf"]),
                            processes=list(result.get("processes") or []),
                            keyword=str(keyword) if keyword else None,
                        )
                        await _mark_consultation_done(conn, job_id, str(row["id"]), stats)
                        _ensure_enrichment_worker(database_url, str(row["client_id"]))
                    except Exception as exc:
                        log.exception("Falha ao persistir resultado eProc job=%s consultation=%s", job_id, row["id"])
                        await _mark_consultation_error(conn, job_id, str(row["id"]), str(exc))
            finally:
                await conn.close()
    except asyncio.CancelledError:
        conn = await asyncpg.connect(database_url)
        try:
            await _cancel_job_in_progress(conn, job_id, "Worker eProc interrompido")
        finally:
            await conn.close()
        raise
    except Exception as exc:
        conn = await asyncpg.connect(database_url)
        try:
            message = _query_job_error_message(exc)
            log.exception("Worker eProc falhou job=%s: %s", job_id, message)
            await _fail_job_and_release_pending(conn, job_id, message)
        finally:
            await conn.close()


async def _ensure_queue_schema(conn: asyncpg.Connection) -> None:
    await conn.execute("ALTER TABLE juridico_captacao_consultations DROP CONSTRAINT IF EXISTS juridico_captacao_consultations_status_check")
    await conn.execute(
        "ALTER TABLE juridico_captacao_consultations ADD CONSTRAINT juridico_captacao_consultations_status_check CHECK (status IN ('pending', 'running', 'done', 'error'))"
    )
    await conn.execute(
        """ALTER TABLE juridico_captacao_consultations
           ADD COLUMN IF NOT EXISTS job_id uuid,
           ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
           ADD COLUMN IF NOT EXISTS locked_at timestamptz,
           ADD COLUMN IF NOT EXISTS locked_by text"""
    )
    await conn.execute(
        """CREATE TABLE IF NOT EXISTS juridico_eproc_query_jobs (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id uuid NOT NULL,
            portal_id uuid NOT NULL REFERENCES juridico_portals(id),
            status varchar(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
            keyword_filter text,
            cpf_filter varchar(14),
            total integer NOT NULL DEFAULT 0,
            processed integer NOT NULL DEFAULT 0,
            success_count integer NOT NULL DEFAULT 0,
            error_count integer NOT NULL DEFAULT 0,
            processes_received integer NOT NULL DEFAULT 0,
            processes_persisted integer NOT NULL DEFAULT 0,
            processes_filtered integer NOT NULL DEFAULT 0,
            last_error text,
            worker_id text,
            started_at timestamptz,
            finished_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )"""
    )
    await conn.execute(
        """ALTER TABLE juridico_processes
           ADD COLUMN IF NOT EXISTS detail_status varchar(24) NOT NULL DEFAULT 'pending'
               CHECK (detail_status IN ('pending', 'running', 'done', 'error')),
           ADD COLUMN IF NOT EXISTS detail_enriched_at timestamptz,
           ADD COLUMN IF NOT EXISTS detail_error text"""
    )
    await conn.execute(
        """CREATE TABLE IF NOT EXISTS juridico_eproc_process_enrichment_jobs (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id uuid NOT NULL,
            process_id uuid NOT NULL REFERENCES juridico_processes(id) ON DELETE CASCADE,
            status varchar(24) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'done', 'error')),
            attempt_count integer NOT NULL DEFAULT 0,
            locked_at timestamptz,
            locked_by text,
            last_error text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE (process_id)
        )"""
    )
    await conn.execute(
        """CREATE INDEX IF NOT EXISTS juridico_eproc_process_enrichment_queue_idx
           ON juridico_eproc_process_enrichment_jobs(client_id, status, created_at)
           WHERE status IN ('pending', 'running')"""
    )


async def _ensure_missing_consultations(conn: asyncpg.Connection, client_id: str, portal_id: str) -> None:
    await conn.execute(
        """WITH latest_import AS (
             SELECT DISTINCT ON (ic.cpf_id) ic.cpf_id, ci.id AS import_id, ci.uf
             FROM juridico_captacao_import_cpfs ic
             JOIN juridico_captacao_imports ci ON ci.id = ic.import_id AND ci.client_id = $1
             ORDER BY ic.cpf_id, ci.created_at DESC
           )
           INSERT INTO juridico_captacao_consultations (cpf_id, portal_id, import_id, client_id, uf, status)
           SELECT c.id, $2, latest_import.import_id, $1, latest_import.uf, 'pending'
           FROM juridico_captacao_cpfs c
           JOIN latest_import ON latest_import.cpf_id = c.id
           WHERE c.client_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM juridico_captacao_consultations existing
               WHERE existing.cpf_id = c.id AND existing.portal_id = $2
             )
           ON CONFLICT DO NOTHING""",
        client_id,
        portal_id,
    )


async def _cancel_active_query_jobs(conn: asyncpg.Connection, client_id: str, portal_id: str) -> None:
    rows = await conn.fetch(
        """SELECT id
           FROM juridico_eproc_query_jobs
           WHERE client_id = $1
             AND portal_id = $2
             AND status IN ('queued', 'running')""",
        client_id,
        portal_id,
    )
    job_ids = [row["id"] for row in rows]
    if not job_ids:
        return

    for job_id in job_ids:
        task = _query_job_tasks.pop(str(job_id), None)
        if task:
            task.cancel()

    await conn.execute(
        """UPDATE juridico_eproc_query_jobs
           SET status = 'cancelled', finished_at = now(), updated_at = now()
           WHERE id = ANY($1::uuid[])""",
        job_ids,
    )
    await conn.execute(
        """UPDATE juridico_captacao_consultations
           SET status = 'pending',
               last_consulted_at = CASE WHEN status = 'done' THEN NULL ELSE last_consulted_at END,
               error_message = NULL,
               job_id = NULL,
               locked_at = NULL,
               locked_by = NULL,
               updated_at = now()
           WHERE job_id = ANY($1::uuid[])
             AND status IN ('pending', 'running', 'done')""",
        job_ids,
    )


async def _enqueue_job(
    conn: asyncpg.Connection,
    *,
    job_id: str,
    client_id: str,
    portal_id: str,
    cpf: str | None,
    keyword: str | None,
    max_consultations: int | None,
) -> int:
    cpf_digits = "".join(ch for ch in cpf or "" if ch.isdigit()) or None
    if cpf_digits:
        cpf_row = await conn.fetchrow(
            """INSERT INTO juridico_captacao_cpfs (client_id, cpf)
               VALUES ($1, $2)
               ON CONFLICT (client_id, cpf) DO UPDATE SET cpf = EXCLUDED.cpf
               RETURNING id""",
            client_id,
            cpf_digits,
        )
        await conn.execute(
            """INSERT INTO juridico_captacao_consultations (cpf_id, portal_id, client_id, uf, status)
               VALUES ($1, $2, $3, 'SC', 'pending')
               ON CONFLICT DO NOTHING""",
            cpf_row["id"],
            portal_id,
            client_id,
        )

    limit = max(1, min(int(max_consultations or 10), 500))
    rows = await conn.fetch(
        """SELECT cc.id
           FROM juridico_captacao_consultations cc
           JOIN juridico_captacao_cpfs cf ON cf.id = cc.cpf_id
           WHERE cc.client_id = $1
             AND cc.portal_id = $2
             AND cc.status = 'pending'
             AND ($3::varchar IS NULL OR cf.cpf = $3)
           ORDER BY cc.created_at ASC
           LIMIT $4""",
        client_id,
        portal_id,
        cpf_digits,
        limit,
    )
    consultation_ids = [row["id"] for row in rows]
    total = len(consultation_ids)
    await conn.execute(
        """INSERT INTO juridico_eproc_query_jobs
           (id, client_id, portal_id, status, keyword_filter, cpf_filter, total, finished_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 = 0 THEN now() ELSE NULL END)""",
        job_id,
        client_id,
        portal_id,
        "queued" if total > 0 else "completed",
        keyword.strip() if keyword else None,
        cpf_digits,
        total,
    )
    if total > 0:
        await conn.execute(
            """UPDATE juridico_captacao_consultations
               SET job_id = $2, keyword_filter_snapshot = $3, updated_at = now()
               WHERE id = ANY($1::uuid[])""",
            consultation_ids,
            job_id,
            keyword.strip() if keyword else None,
        )
    return total


async def _claim_consultations(conn: asyncpg.Connection, job_id: str, worker_id: str, limit: int) -> list[asyncpg.Record]:
    async with conn.transaction():
        rows = await conn.fetch(
            """SELECT cc.id, cc.client_id, cf.cpf
               FROM juridico_captacao_consultations cc
               JOIN juridico_captacao_cpfs cf ON cf.id = cc.cpf_id
               WHERE cc.job_id = $1
                 AND (cc.status = 'pending' OR (cc.status = 'running' AND cc.locked_at < now() - interval '15 minutes'))
               ORDER BY cc.created_at ASC
               LIMIT $2
               FOR UPDATE SKIP LOCKED""",
            job_id,
            limit,
        )
        ids = [row["id"] for row in rows]
        if ids:
            await conn.execute(
                """UPDATE juridico_captacao_consultations
                   SET status = 'running',
                       locked_at = now(),
                       locked_by = $2,
                       attempt_count = attempt_count + 1,
                       updated_at = now()
                   WHERE id = ANY($1::uuid[])""",
                ids,
                worker_id,
            )
        return rows


async def _mark_consultation_done(conn: asyncpg.Connection, job_id: str, consultation_id: str, stats: dict[str, int]) -> None:
    await conn.execute(
        """UPDATE juridico_captacao_consultations
           SET status = 'done', last_consulted_at = now(), error_message = NULL,
               locked_at = NULL, locked_by = NULL, updated_at = now()
           WHERE id = $1""",
        consultation_id,
    )
    await conn.execute(
        """UPDATE juridico_eproc_query_jobs
           SET processed = processed + 1,
               success_count = success_count + 1,
               processes_received = processes_received + $2,
               processes_persisted = processes_persisted + $3,
               processes_filtered = processes_filtered + $4,
               updated_at = now()
           WHERE id = $1""",
        job_id,
        stats["received"],
        stats["persisted"],
        stats["filtered"],
    )


async def _mark_consultation_error(conn: asyncpg.Connection, job_id: str, consultation_id: str, error: str) -> None:
    await conn.execute(
        """UPDATE juridico_captacao_consultations
           SET status = 'error', error_message = $2, locked_at = NULL, locked_by = NULL, updated_at = now()
           WHERE id = $1""",
        consultation_id,
        error,
    )
    await conn.execute(
        """UPDATE juridico_eproc_query_jobs
           SET processed = processed + 1, error_count = error_count + 1,
               last_error = $2, updated_at = now()
           WHERE id = $1""",
        job_id,
        error,
    )


async def _mark_batch_error(conn: asyncpg.Connection, job_id: str, rows: list[asyncpg.Record], error: str) -> None:
    for row in rows:
        await _mark_consultation_error(conn, job_id, str(row["id"]), error)


def _query_job_error_message(exc: BaseException) -> str:
    if isinstance(exc, asyncio.TimeoutError):
        return f"Timeout ao consultar lote eProc apos {QUERY_BATCH_TIMEOUT_SECONDS}s"
    return str(exc) or exc.__class__.__name__


async def _fail_job(conn: asyncpg.Connection, job_id: str, error: str) -> None:
    await conn.execute(
        """UPDATE juridico_eproc_query_jobs
           SET status = 'failed', last_error = $2, finished_at = now(), updated_at = now()
           WHERE id = $1""",
        job_id,
        error,
    )


async def _cancel_job_in_progress(conn: asyncpg.Connection, job_id: str, reason: str) -> None:
    await conn.execute(
        """UPDATE juridico_eproc_query_jobs
           SET status = 'cancelled', last_error = $2, finished_at = now(), updated_at = now()
           WHERE id = $1
             AND status IN ('queued', 'running')""",
        job_id,
        reason,
    )
    await _release_job_retriable_consultations(conn, job_id)


async def _fail_job_and_release_pending(conn: asyncpg.Connection, job_id: str, error: str) -> None:
    await _fail_job(conn, job_id, error)
    await _release_job_retriable_consultations(conn, job_id)


async def _release_job_retriable_consultations(conn: asyncpg.Connection, job_id: str) -> None:
    await conn.execute(
        """UPDATE juridico_captacao_consultations
           SET status = 'pending',
               last_consulted_at = CASE WHEN status = 'done' THEN NULL ELSE last_consulted_at END,
               error_message = NULL,
               job_id = NULL,
               locked_at = NULL,
               locked_by = NULL,
               updated_at = now()
           WHERE job_id = $1
             AND status IN ('pending', 'running', 'done')""",
        job_id,
    )


async def _finish_job_if_done(conn: asyncpg.Connection, job_id: str) -> None:
    await conn.execute(
        """UPDATE juridico_eproc_query_jobs
           SET status = CASE WHEN error_count > 0 THEN 'completed' ELSE 'completed' END,
               finished_at = now(),
               updated_at = now()
           WHERE id = $1
             AND NOT EXISTS (
               SELECT 1 FROM juridico_captacao_consultations
               WHERE job_id = $1 AND status IN ('pending', 'running')
             )""",
        job_id,
    )


def _ensure_enrichment_worker(database_url: str, client_id: str) -> None:
    if client_id in _enrichment_tasks:
        return
    task = asyncio.create_task(_run_process_enrichment_jobs(database_url, client_id))
    _track_enrichment(client_id, task)


async def _enqueue_process_enrichment(conn: asyncpg.Connection, client_id: str, process_id: Any) -> None:
    await conn.execute(
        """INSERT INTO juridico_eproc_process_enrichment_jobs (client_id, process_id, status)
           VALUES ($1, $2, 'pending')
           ON CONFLICT (process_id) DO UPDATE
           SET status = 'pending',
               locked_at = NULL,
               locked_by = NULL,
               last_error = NULL,
               updated_at = now()""",
        client_id,
        process_id,
    )


async def _run_process_enrichment_jobs(database_url: str, client_id: str) -> None:
    worker_id = f"eproc-enrichment-{os.getpid()}"

    from ..eproc.adapter import EprocTjscAdapter

    while True:
        conn = await asyncpg.connect(database_url)
        try:
            await _ensure_queue_schema(conn)
            session = await get_active_session(conn, client_id)
            if not session:
                return
            session_json = decrypt_session(client_id, bytes(session["session_state_enc"]))
            rows = await _claim_process_enrichment_jobs(conn, client_id, worker_id, 1)
            if not rows:
                return
        finally:
            await conn.close()

        adapter = EprocTjscAdapter()
        for row in rows:
            conn = await asyncpg.connect(database_url)
            try:
                process_data = _json_object(row["raw_data"])
                enriched = await adapter.enrich_processes(session_json, [process_data])
                enriched_process = enriched[0] if enriched else process_data
                parties = enriched_process.get("parties") or []
                if not parties:
                    parties = _raw_process_parties(enriched_process)
                if not _has_detail_page_parties(parties):
                    raise RuntimeError(
                        "Detalhe eProc nao retornou partes/representantes da pagina interna; "
                        "resultado da listagem nao pode concluir enriquecimento"
                    )
                await conn.execute(
                    """UPDATE juridico_processes
                       SET parties = $2::jsonb,
                           raw_data = $3::jsonb,
                           detail_status = 'done',
                           detail_enriched_at = now(),
                           detail_error = NULL,
                           updated_at = now()
                       WHERE id = $1 AND client_id = $4""",
                    row["process_id"],
                    json.dumps(parties),
                    json.dumps(enriched_process),
                    client_id,
                )
                await conn.execute(
                    """UPDATE juridico_eproc_process_enrichment_jobs
                       SET status = 'done', locked_at = NULL, locked_by = NULL, updated_at = now()
                       WHERE id = $1""",
                    row["job_id"],
                )
            except Exception as exc:
                message = str(exc)
                await conn.execute(
                    """UPDATE juridico_processes
                       SET detail_status = 'error', detail_error = $2, updated_at = now()
                       WHERE id = $1 AND client_id = $3""",
                    row["process_id"],
                    message,
                    client_id,
                )
                await conn.execute(
                    """UPDATE juridico_eproc_process_enrichment_jobs
                       SET status = 'error',
                           locked_at = NULL,
                           locked_by = NULL,
                           last_error = $2,
                           updated_at = now()
                       WHERE id = $1""",
                    row["job_id"],
                    message,
                )
                if "eProc session expired" in message or "authenticated menu" in message:
                    return
            finally:
                await conn.close()


async def _claim_process_enrichment_jobs(
    conn: asyncpg.Connection,
    client_id: str,
    worker_id: str,
    limit: int,
) -> list[asyncpg.Record]:
    async with conn.transaction():
        rows = await conn.fetch(
            """SELECT ej.id AS job_id, ej.process_id, jp.raw_data
               FROM juridico_eproc_process_enrichment_jobs ej
               JOIN juridico_processes jp ON jp.id = ej.process_id AND jp.client_id = ej.client_id
               WHERE ej.client_id = $1
                 AND (ej.status = 'pending' OR (ej.status = 'running' AND ej.locked_at < now() - interval '15 minutes'))
               ORDER BY ej.created_at ASC
               LIMIT $2
               FOR UPDATE SKIP LOCKED""",
            client_id,
            limit,
        )
        ids = [row["job_id"] for row in rows]
        process_ids = [row["process_id"] for row in rows]
        if ids:
            await conn.execute(
                """UPDATE juridico_eproc_process_enrichment_jobs
                   SET status = 'running',
                       locked_at = now(),
                       locked_by = $2,
                       attempt_count = attempt_count + 1,
                       updated_at = now()
                   WHERE id = ANY($1::uuid[])""",
                ids,
                worker_id,
            )
            await conn.execute(
                """UPDATE juridico_processes
                   SET detail_status = 'running', detail_error = NULL, updated_at = now()
                   WHERE id = ANY($1::uuid[]) AND client_id = $2""",
                process_ids,
                client_id,
            )
        return rows


async def _persist_processes(
    conn: asyncpg.Connection,
    *,
    client_id: str,
    cpf: str,
    processes: list[dict[str, Any]],
    keyword: str | None,
) -> dict[str, int]:
    portal_id = await conn.fetchval("SELECT id FROM juridico_portals WHERE slug = 'eproc' LIMIT 1")
    persisted = 0
    filtered = 0
    decisions = _process_persistence_decisions(processes, keyword)
    for decision in decisions:
        if not decision["should_persist"]:
            filtered += 1
            continue
        process = decision["process"]
        raw_data = decision["raw_data"]
        matches = decision["matches"]
        data_autuacao = decision["data_autuacao"]
        process_number = str(process.get("numero") or "").strip()
        if not process_number:
            filtered += 1
            continue
        parties = _raw_process_parties(process)
        match_data = {"keyword": keyword, "matches": matches} if keyword else {}
        existing_id = await conn.fetchval(
            """SELECT id FROM juridico_processes
               WHERE client_id = $1 AND portal_id = $2 AND process_number = $3 AND cpf_query = $4
               LIMIT 1""",
            client_id,
            portal_id,
            process_number,
            cpf,
        )
        if existing_id:
            await conn.execute(
                """UPDATE juridico_processes
                   SET subject = $2, data_autuacao = $3, parties = $4::jsonb,
                       raw_data = $5::jsonb, match_data = $6::jsonb,
                       detail_status = 'pending',
                       detail_error = NULL,
                       detail_enriched_at = NULL,
                       updated_at = now()
                   WHERE id = $1""",
                existing_id,
                process.get("assunto"),
                data_autuacao,
                json.dumps(parties),
                json.dumps(raw_data),
                json.dumps(match_data),
            )
            process_id = existing_id
        else:
            process_id = await conn.fetchval(
                """INSERT INTO juridico_processes
                   (client_id, portal_id, process_number, cpf_query, subject, data_autuacao, parties, raw_data, match_data)
                   VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
                   RETURNING id""",
                client_id,
                portal_id,
                process_number,
                cpf,
                process.get("assunto"),
                data_autuacao,
                json.dumps(parties),
                json.dumps(raw_data),
                json.dumps(match_data),
            )
        await _enqueue_process_enrichment(conn, client_id, process_id)
        persisted += 1
    return {"received": len(processes), "persisted": persisted, "filtered": filtered}


def _process_persistence_decisions(processes: list[dict[str, Any]], keyword: str | None) -> list[dict[str, Any]]:
    candidates = []
    has_keyword_match = False

    for process in processes:
        raw_data = process.get("raw_data") or process
        matches = _find_keyword_matches(raw_data, keyword) if keyword else []
        data_autuacao = _parse_iso_date(process.get("data_autuacao") or process.get("data_distribuicao"))
        if matches:
            has_keyword_match = True
        candidates.append(
            {
                "process": process,
                "raw_data": raw_data,
                "matches": matches,
                "data_autuacao": data_autuacao,
                "should_persist": False,
            }
        )

    for candidate in candidates:
        if keyword and has_keyword_match:
            candidate["should_persist"] = bool(candidate["matches"])
            continue
        candidate["should_persist"] = _is_within_last_years(candidate["data_autuacao"], 5)

    return candidates


def _raw_process_parties(process: dict[str, Any]) -> list[Any]:
    raw_data = process.get("raw_data") or process
    parties = process.get("parties") or (raw_data.get("parties") if isinstance(raw_data, dict) else None)
    if isinstance(parties, list) and parties:
        return parties
    fallback = []
    if isinstance(raw_data, dict):
        if raw_data.get("autor"):
            fallback.append({"role": "autor", "label": "AUTOR", "name": str(raw_data["autor"]), "source": "result_row"})
        if raw_data.get("reu"):
            fallback.append({"role": "reu", "label": "RÉU", "name": str(raw_data["reu"]), "source": "result_row"})
    return fallback


def _has_detail_page_parties(parties: list[Any]) -> bool:
    return any(isinstance(party, dict) and party.get("source") == "detail_page" for party in parties)


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _parse_iso_date(value: Any) -> Any:
    text = str(value or "")
    if len(text) != 10 or text[4] != "-" or text[7] != "-":
        return None
    from datetime import date

    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _is_within_last_years(date_value: Any, years: int) -> bool:
    if not date_value:
        return False
    from datetime import date

    return date_value >= date(date.today().year - years, date.today().month, date.today().day)


def _find_keyword_matches(value: Any, keyword: str | None) -> list[dict[str, Any]]:
    if not keyword:
        return []
    needle = keyword.lower()
    matches: list[dict[str, Any]] = []

    def visit(node: Any, path: str, key: str | None) -> None:
        if isinstance(node, (str, int, float, bool)):
            text = str(node)
            index = text.lower().find(needle)
            if index >= 0:
                matches.append({"path": path, "key": key, "value": text, "index": index})
            return
        if isinstance(node, list):
            for index, item in enumerate(node):
                visit(item, f"{path}[{index}]", str(index))
            return
        if isinstance(node, dict):
            for child_key, child_value in node.items():
                visit(child_value, f"{path}.{child_key}", child_key)

    visit(value, "$", None)
    return matches
