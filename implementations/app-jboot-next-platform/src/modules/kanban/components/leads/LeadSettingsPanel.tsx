"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Col, Input, Label, Row, Spinner, Table } from "reactstrap";
import { BoardDto, kanbanApi, LeadSettingsDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { LEAD_FIELD_GROUPS, leadFieldLabel } from "@/modules/kanban/lib/leads";

interface LeadSettingsPanelProps {
  boards: BoardDto[];
  onBoardsChanged: () => Promise<void> | void;
}

/**
 * Configuracao do envio (Sprint 4): campos cadastrais obrigatorios do tenant
 * (P16; CPF sempre, pelo cliente vinculado) e captacao de leads por quadro
 * (PE1). Os documentos obrigatorios continuam no checklist de cada quadro.
 */
export default function LeadSettingsPanel({ boards, onBoardsChanged }: LeadSettingsPanelProps) {
  const [settings, setSettings] = useState<LeadSettingsDto | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyBoardId, setBusyBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await kanbanApi.leads.settings();
      setSettings(result);
      setSelected(new Set(result.requiredFields));
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar a configuração do envio"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await kanbanApi.leads.updateSettings([...selected]);
      setSettings(result);
      setSelected(new Set(result.requiredFields));
      setSuccess("Campos obrigatórios salvos. Valem para o próximo envio.");
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao salvar os campos obrigatórios"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleIntake(board: BoardDto) {
    setBusyBoardId(board.id);
    setError(null);
    setSuccess(null);
    try {
      await kanbanApi.boards.update(board.id, { leadIntakeEnabled: !board.leadIntakeEnabled });
      await onBoardsChanged();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao alterar a captação do quadro"));
    } finally {
      setBusyBoardId(null);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-4">
        <Spinner color="primary" />
      </div>
    );
  }

  const available = new Set(settings?.availableFields ?? []);

  return (
    <>
      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert color="success" toggle={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      <Card>
        <CardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h5 className="mb-0">Campos obrigatórios para envio</h5>
          <div className="d-flex gap-2">
            <Button
              color="light"
              size="sm"
              onClick={() => setSelected(new Set(settings?.defaultRequiredFields ?? []))}
              disabled={saving}
            >
              <i className="ri-restart-line me-1" />
              Padrão
            </Button>
            <Button color="primary" size="sm" onClick={() => void save()} disabled={saving || !settings}>
              {saving ? <Spinner size="sm" className="me-1" /> : <i className="ri-save-line me-1" />}
              Salvar
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            O escritório só envia o lead com o cliente vinculado (o CPF vem sempre do cliente), estes campos preenchidos
            no cadastro e todos os documentos obrigatórios do checklist do quadro enviados e não rejeitados.
            {settings && !settings.configured && " Usando o padrão: nome, data de nascimento e endereço."}
          </p>
          <Row className="g-3">
            {LEAD_FIELD_GROUPS.map((group) => (
              <Col md={4} key={group.label}>
                <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">
                  <i className={`${group.icon} me-1`} />
                  {group.label}
                </p>
                {group.keys
                  .filter((key) => available.has(key))
                  .map((key) => (
                    <div className="form-check mb-1" key={key}>
                      <Input
                        id={`lead-field-${key}`}
                        type="checkbox"
                        className="form-check-input"
                        checked={selected.has(key)}
                        onChange={() => toggle(key)}
                        disabled={saving}
                      />
                      <Label className="form-check-label" for={`lead-field-${key}`}>
                        {leadFieldLabel(key)}
                      </Label>
                    </div>
                  ))}
              </Col>
            ))}
          </Row>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h5 className="mb-0">Captação de leads por quadro</h5>
        </CardHeader>
        <CardBody>
          <p className="text-muted small">
            Só quadros com a captação ligada mostram “Enviar para análise” no card. Quadros de tarefas comuns ficam como estão.
          </p>
          {boards.length === 0 ? (
            <p className="text-muted text-center py-4 mb-0">Nenhum quadro ativo.</p>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap align-middle mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Quadro</th>
                    <th>Captação</th>
                    <th className="text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {boards.map((board) => (
                    <tr key={board.id}>
                      <td>{board.name}</td>
                      <td>
                        <span className={`badge ${board.leadIntakeEnabled ? "bg-success-subtle text-success" : "bg-dark-subtle text-dark"}`}>
                          {board.leadIntakeEnabled ? "Ligada" : "Desligada"}
                        </span>
                      </td>
                      <td className="text-end">
                        <Button
                          size="sm"
                          color={board.leadIntakeEnabled ? "danger" : "success"}
                          outline
                          onClick={() => void toggleIntake(board)}
                          disabled={busyBoardId === board.id}
                        >
                          {busyBoardId === board.id ? <Spinner size="sm" /> : board.leadIntakeEnabled ? "Desligar" : "Ligar"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
