"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Col, Form, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner } from "reactstrap";
import { ComandaAdminItem, comandaAdminApi } from "@/modules/pdv/lib/comanda-admin-api";
import { ComandaQueueList } from "./ComandaQueueList";

export function ComandaTriagemPage() {
  const [pendentes, setPendentes] = useState<ComandaAdminItem[]>([]);
  const [prontos, setProntos] = useState<ComandaAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<ComandaAdminItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [pendentesResult, prontosResult] = await Promise.all([
        comandaAdminApi.itensPendentes(),
        comandaAdminApi.itensProntos()
      ]);
      setPendentes(pendentesResult);
      setProntos(prontosResult);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar filas de comanda");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleEncaminhar(item: ComandaAdminItem) {
    setActionError(null);
    setActionLoadingId(item.id);
    try {
      await comandaAdminApi.encaminhar(item.id);
      setPendentes((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao encaminhar item");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleLiberar(item: ComandaAdminItem) {
    setActionError(null);
    setActionLoadingId(item.id);
    try {
      await comandaAdminApi.liberar(item.id);
      setProntos((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao liberar item");
    } finally {
      setActionLoadingId(null);
    }
  }

  function openCancelModal(item: ComandaAdminItem) {
    setCancelTarget(item);
    setCancelReason("");
    setCancelError(null);
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    const requiresReason = cancelTarget.status !== "pendente";
    if (requiresReason && !cancelReason.trim()) {
      setCancelError("Informe o motivo do cancelamento.");
      return;
    }
    setCancelLoading(true);
    setCancelError(null);
    try {
      await comandaAdminApi.cancelar(cancelTarget.id, cancelReason.trim() || undefined);
      setPendentes((prev) => prev.filter((i) => i.id !== cancelTarget.id));
      setProntos((prev) => prev.filter((i) => i.id !== cancelTarget.id));
      setCancelTarget(null);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Erro ao cancelar item");
    } finally {
      setCancelLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-content d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  return (
    <div className="page-content">
      <h5 className="mb-3">
        <i className="ri-list-check-2 me-2" />
        Triagem — Operador de Balcão
      </h5>

      {loadError && <Alert color="danger">{loadError}</Alert>}
      {actionError && <Alert color="danger">{actionError}</Alert>}

      <Row className="g-3">
        <Col lg={6}>
          <ComandaQueueList
            title="Pendentes"
            icon="ri-time-line"
            items={pendentes}
            loading={false}
            error={null}
            emptyIcon="ri-inbox-line"
            emptyMessage="Nenhum item pendente."
            actionLabel="Encaminhar"
            actionIcon="ri-arrow-right-line"
            actionColor="primary"
            actionLoadingId={actionLoadingId}
            onAction={(item) => void handleEncaminhar(item)}
            onCancel={(item) => openCancelModal(item)}
          />
        </Col>
        <Col lg={6}>
          <ComandaQueueList
            title="Prontos para liberação"
            icon="ri-checkbox-circle-line"
            items={prontos}
            loading={false}
            error={null}
            emptyIcon="ri-checkbox-circle-line"
            emptyMessage="Nenhum item pronto aguardando liberação."
            actionLabel="Liberar"
            actionIcon="ri-check-line"
            actionColor="success"
            actionLoadingId={actionLoadingId}
            onAction={(item) => void handleLiberar(item)}
            onCancel={(item) => openCancelModal(item)}
            timestampField="finalizadoAt"
            timestampLabel="Finalizado às"
          />
        </Col>
      </Row>

      <Modal isOpen={!!cancelTarget} toggle={() => setCancelTarget(null)} centered>
        <ModalHeader toggle={() => setCancelTarget(null)}>Cancelar item</ModalHeader>
        <ModalBody>
          {cancelError && <Alert color="danger" className="py-2 small">{cancelError}</Alert>}
          {cancelTarget && (
            <p className="mb-3">
              <strong>{cancelTarget.productName}</strong> — Mesa {cancelTarget.tableNumber}
            </p>
          )}
          {cancelTarget && cancelTarget.status !== "pendente" ? (
            <Form>
              <FormGroup>
                <Label for="cancelReason">
                  Motivo do cancelamento <span className="text-danger">*</span>
                </Label>
                <Input
                  id="cancelReason"
                  type="textarea"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Item já em produção — cancelamento é uma exceção auditada."
                />
              </FormGroup>
            </Form>
          ) : (
            <p className="text-muted small mb-0">Item ainda pendente — cancelamento não exige motivo.</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setCancelTarget(null)} disabled={cancelLoading}>Voltar</Button>
          <Button color="danger" onClick={() => void confirmCancel()} disabled={cancelLoading}>
            {cancelLoading ? <Spinner size="sm" className="me-1" /> : <i className="ri-close-circle-line me-1" />}
            Confirmar Cancelamento
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
