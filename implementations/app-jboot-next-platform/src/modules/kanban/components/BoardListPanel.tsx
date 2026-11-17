"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, Spinner } from "reactstrap";
import { BoardDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";

export default function BoardListPanel() {
  const [boards, setBoards] = useState<BoardDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const page = await kanbanApi.boards.list();
      setBoards(page.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar boards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await kanbanApi.boards.create({ name: name.trim() });
      setName("");
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erro ao criar board");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="card">
        <div className="card-body">
          <h5 className="card-title mb-3">Novo board</h5>
          <form className="d-flex flex-column flex-sm-row gap-2" onSubmit={(e) => void handleCreate(e)}>
            <Input
              placeholder="Nome do board"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={creating}
            />
            <Button color="primary" type="submit" disabled={creating || !name.trim()}>
              {creating ? <Spinner size="sm" className="me-1" /> : <i className="ri-add-line align-bottom me-1" />}
              Criar board
            </Button>
          </form>
          {createError && (
            <Alert color="danger" className="mt-3 mb-0 py-2">
              <i className="ri-error-warning-line me-2" />
              {createError}
            </Alert>
          )}
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-center py-5">
            <Spinner />
          </div>
        ) : loadError ? (
          <Alert color="danger">
            <i className="ri-error-warning-line me-2" />
            {loadError}
          </Alert>
        ) : boards.length === 0 ? (
          <Alert color="secondary" className="text-center">
            Nenhum board ainda. Crie o primeiro acima.
          </Alert>
        ) : (
          <div className="row g-3">
            {boards.map((board) => (
              <div className="col-md-4" key={board.id}>
                <Link href={`/flow/boards/${board.id}`} className="text-decoration-none">
                  <div className="card h-100 shadow-sm">
                    <div className="card-body">
                      <h5 className="card-title mb-1">{board.name}</h5>
                      {board.description && <p className="text-muted small mb-2">{board.description}</p>}
                      {board.currentUserRole === "board_admin" && (
                        <span className="badge bg-primary-subtle text-primary">Admin</span>
                      )}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
