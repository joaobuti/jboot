"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Form,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table
} from "reactstrap";
import { getApplicationScopes } from "@/lib/module-auth-token";
import { ComandaMesa, comandaAdminApi } from "@/modules/pdv/lib/comanda-admin-api";
import { ComandaQrSheet, comandaPublicUrl } from "./ComandaQrSheet";

interface ComandaMesasPageProps {
  /** Titulo alternativo quando embutida em outra tela. */
  title?: string;
}

export function ComandaMesasPage({ title = "Mesas" }: ComandaMesasPageProps) {
  const [mesas, setMesas] = useState<ComandaMesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ComandaMesa | null>(null);
  const [formTableNumber, setFormTableNumber] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [printQueue, setPrintQueue] = useState<ComandaMesa[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<ComandaMesa | null>(null);
  const [revoking, setRevoking] = useState(false);

  const canWrite = useMemo(
    () => getApplicationScopes("app:pdv", "pdvAccessToken").includes("pdv:admin:write"),
    []
  );

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setMesas(await comandaAdminApi.listMesas());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar mesas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormTableNumber("");
    setFormLabel("");
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(mesa: ComandaMesa) {
    setEditing(mesa);
    setFormTableNumber(String(mesa.tableNumber));
    setFormLabel(mesa.label ?? "");
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleSave() {
    setFormError(null);
    if (!editing) {
      const parsed = Number(formTableNumber);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setFormError("Informe um numero de mesa inteiro maior que zero.");
        return;
      }
    }

    setSaving(true);
    try {
      if (editing) {
        await comandaAdminApi.updateMesa(editing.id, formLabel);
      } else {
        await comandaAdminApi.createMesa(Number(formTableNumber), formLabel);
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar mesa");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(mesa: ComandaMesa) {
    setActionError(null);
    setActionLoadingId(mesa.id);
    try {
      await comandaAdminApi.updateMesaStatus(mesa.id, mesa.status === "active" ? "inactive" : "active");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao alterar status da mesa");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    setActionError(null);
    try {
      await comandaAdminApi.regenerarQrMesa(revokeTarget.id);
      setRevokeTarget(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao revogar QR");
    } finally {
      setRevoking(false);
    }
  }

  /**
   * A folha so e montada no momento da impressao (nao fica renderizada o tempo
   * todo) e a chamada de `window.print()` acontece depois que as imagens do QR
   * terminam de ser geradas — imprimir antes sairia com quadros em branco.
   */
  function print(target: ComandaMesa[]) {
    const printable = target.filter((mesa) => mesa.qrToken);
    if (printable.length === 0) {
      setActionError("Nenhuma mesa ativa com QR para imprimir.");
      return;
    }
    setActionError(null);
    setPrintQueue(printable);
  }

  const activeMesas = mesas.filter((mesa) => mesa.status === "active");

  return (
    <div className="page-content">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h5 className="mb-0">
          <i className="ri-layout-grid-line me-2" />
          {title}
        </h5>
        <div className="d-flex gap-2">
          <Button color="light" size="sm" onClick={() => print(activeMesas)} disabled={activeMesas.length === 0}>
            <i className="ri-printer-line me-1" />
            Imprimir QR de todas
          </Button>
          {canWrite && (
            <Button color="primary" size="sm" onClick={openCreate}>
              <i className="ri-add-line me-1" />
              Nova mesa
            </Button>
          )}
        </div>
      </div>

      {loadError && <Alert color="danger">{loadError}</Alert>}
      {actionError && <Alert color="danger">{actionError}</Alert>}

      <Card>
        <CardHeader className="d-flex align-items-center justify-content-between">
          <span className="fw-medium">Mesas cadastradas</span>
          <span className="text-muted small">{mesas.length} mesa(s)</span>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="d-flex justify-content-center py-4">
              <Spinner color="primary" />
            </div>
          ) : mesas.length === 0 ? (
            <div className="text-center text-muted py-4">
              <i className="ri-layout-grid-line fs-3 d-block mb-2" />
              Nenhuma mesa cadastrada.
            </div>
          ) : (
            <div className="table-responsive">
              <Table className="table-nowrap align-middle mb-0" hover>
                <thead className="table-light">
                  <tr>
                    <th>Mesa</th>
                    <th>Identificacao</th>
                    <th>Status</th>
                    <th>Versao do QR</th>
                    <th className="text-end">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {mesas.map((mesa) => (
                    <tr key={mesa.id}>
                      <td className="fw-medium">{mesa.tableNumber}</td>
                      <td>{mesa.label ?? <span className="text-muted">—</span>}</td>
                      <td>
                        <Badge color={mesa.status === "active" ? "success" : "secondary"}>
                          {mesa.status === "active" ? "Ativa" : "Inativa"}
                        </Badge>
                      </td>
                      <td className="text-muted">v{mesa.tokenVersion}</td>
                      <td className="text-end">
                        <div className="d-inline-flex gap-1">
                          <Button
                            color="light"
                            size="sm"
                            onClick={() => print([mesa])}
                            disabled={!mesa.qrToken}
                            title={mesa.qrToken ? "Imprimir QR" : "Mesa inativa nao tem QR valido"}
                          >
                            <i className="ri-qr-code-line" />
                          </Button>
                          {canWrite && (
                            <>
                              <Button color="light" size="sm" onClick={() => openEdit(mesa)} title="Editar">
                                <i className="ri-pencil-line" />
                              </Button>
                              <Button
                                color="light"
                                size="sm"
                                onClick={() => setRevokeTarget(mesa)}
                                disabled={mesa.status !== "active"}
                                title="Revogar QR impresso"
                              >
                                <i className="ri-refresh-line" />
                              </Button>
                              <Button
                                color={mesa.status === "active" ? "light" : "success"}
                                size="sm"
                                onClick={() => void handleToggleStatus(mesa)}
                                disabled={actionLoadingId === mesa.id}
                                title={mesa.status === "active" ? "Inativar mesa" : "Ativar mesa"}
                              >
                                {actionLoadingId === mesa.id ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <i className={mesa.status === "active" ? "ri-close-circle-line" : "ri-check-line"} />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} toggle={closeModal} centered>
        <ModalHeader toggle={closeModal}>{editing ? "Editar mesa" : "Nova mesa"}</ModalHeader>
        <ModalBody>
          {formError && <Alert color="danger" className="py-2 small">{formError}</Alert>}
          <Form>
            <FormGroup>
              <Label for="mesaTableNumber">
                Numero da mesa <span className="text-danger">*</span>
              </Label>
              <Input
                id="mesaTableNumber"
                type="number"
                min={1}
                value={formTableNumber}
                disabled={!!editing}
                onChange={(e) => setFormTableNumber(e.target.value)}
              />
              {editing && (
                <div className="form-text">
                  O numero nao muda depois de criado: ele esta no QR impresso e colado na mesa. Para corrigir, inative
                  esta mesa e cadastre a correta.
                </div>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="mesaLabel">Identificacao</Label>
              <Input
                id="mesaLabel"
                type="text"
                maxLength={80}
                placeholder="Ex: Varanda, Salao 2, Balcao"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
              />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={closeModal} disabled={saving}>
            Cancelar
          </Button>
          <Button color="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Spinner size="sm" className="me-1" /> : <i className="ri-save-line me-1" />}
            Salvar
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={!!revokeTarget} toggle={() => setRevokeTarget(null)} centered>
        <ModalHeader toggle={() => setRevokeTarget(null)}>Revogar QR da mesa</ModalHeader>
        <ModalBody>
          <p className="mb-2">
            O QR impresso da <strong>Mesa {revokeTarget?.tableNumber}</strong> deixa de funcionar imediatamente. Um novo
            QR e gerado e precisa ser reimpresso e colado na mesa.
          </p>
          <p className="text-muted small mb-0">
            Clientes com comanda ja aberta continuam com a sessao valida — a revogacao afeta apenas novas leituras.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setRevokeTarget(null)} disabled={revoking}>
            Cancelar
          </Button>
          <Button color="danger" onClick={() => void confirmRevoke()} disabled={revoking}>
            {revoking ? <Spinner size="sm" className="me-1" /> : <i className="ri-refresh-line me-1" />}
            Revogar e gerar novo
          </Button>
        </ModalFooter>
      </Modal>

      {printQueue.length > 0 && (
        <ComandaQrSheet
          mesas={printQueue}
          onRendered={() => {
            window.print();
            setPrintQueue([]);
          }}
          onError={(message) => {
            setActionError(message);
            setPrintQueue([]);
          }}
        />
      )}
    </div>
  );
}

export { comandaPublicUrl };
