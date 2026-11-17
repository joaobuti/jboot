"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
} from "reactstrap";
import { CurrencyInput } from "@/components/Common/CurrencyInput";
import {
  PaymentRefund,
  PaymentsProviderConnection,
  PixReconciliationItem,
  pdvApi,
} from "@/modules/pdv/lib/pdv-api";

const statusView = {
  requested: { label: "Aguardando operação", color: "warning" },
  succeeded: { label: "Concluído", color: "success" },
  failed: { label: "Não concluído", color: "danger" },
} as const;
const money = (minor: number) =>
  (minor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PaymentsSettingsPage() {
  const [connection, setConnection] =
    useState<PaymentsProviderConnection | null>(null);
  const [refunds, setRefunds] = useState<PaymentRefund[]>([]);
  const [reconciliation, setReconciliation] = useState<PixReconciliationItem[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [connectionModal, setConnectionModal] = useState(false);
  const [refundModal, setRefundModal] = useState(false);
  const [completion, setCompletion] = useState<PaymentRefund | null>(null);
  const [publicIdentifier, setPublicIdentifier] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [validationConfirmed, setValidationConfirmed] = useState(false);
  const [chargeId, setChargeId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [reason, setReason] = useState("");
  const [succeeded, setSucceeded] = useState(true);
  const [resolutionNote, setResolutionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [connectionResult, refundsResult, reconciliationResult] =
      await Promise.allSettled([
        pdvApi.payments.getConnection(),
        pdvApi.payments.listRefunds(),
        pdvApi.payments.listReconciliation(),
      ]);
    if (connectionResult.status === "fulfilled") {
      setConnection(connectionResult.value);
      setPublicIdentifier(connectionResult.value.publicIdentifier);
    } else {
      const problem = connectionResult.reason as Error & {
        code?: string;
        status?: number;
      };
      if (
        problem.code === "provider_connection_required" ||
        problem.status === 404
      )
        setConnection(null);
      else setError(problem.message || "Não foi possível carregar a conexão");
    }
    if (refundsResult.status === "fulfilled")
      setRefunds(refundsResult.value.data);
    else
      setError(
        (refundsResult.reason as Error).message ||
          "Não foi possível carregar os estornos",
      );
    if (reconciliationResult.status === "fulfilled")
      setReconciliation(reconciliationResult.value.data);
    else
      setError(
        (reconciliationResult.reason as Error).message ||
          "Não foi possível carregar a reconciliação",
      );
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveConnection() {
    if (!publicIdentifier.trim() || !validationConfirmed) return;
    setSaving(true);
    setError(null);
    try {
      setConnection(
        await pdvApi.payments.configureConnection({
          publicIdentifier: publicIdentifier.trim(),
          ...(secretRef.trim() ? { secretRef: secretRef.trim() } : {}),
          validationConfirmed: true,
        }),
      );
      setSecretRef("");
      setValidationConfirmed(false);
      setConnectionModal(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar a conexão",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createRefund() {
    const amountMinor = Math.round(Number(refundAmount) * 100);
    if (!chargeId.trim() || !reason.trim() || amountMinor < 1) return;
    setSaving(true);
    setError(null);
    try {
      await pdvApi.payments.requestRefund({
        chargeId: chargeId.trim(),
        amountMinor,
        reason: reason.trim(),
        idempotencyKey: `pdv-refund-${crypto.randomUUID()}`,
      });
      setChargeId("");
      setRefundAmount("");
      setReason("");
      setRefundModal(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível solicitar o estorno",
      );
    } finally {
      setSaving(false);
    }
  }

  async function completeRefund() {
    if (!completion || !resolutionNote.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await pdvApi.payments.completeRefund(completion.id, {
        succeeded,
        resolutionNote: resolutionNote.trim(),
      });
      setCompletion(null);
      setResolutionNote("");
      setSucceeded(true);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível registrar o resultado",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-content">
      <div className="container-fluid">
        {error && <Alert color="danger">{error}</Alert>}
        <ConnectionCard
          connection={connection}
          loading={loading}
          onConfigure={() => {
            setError(null);
            setConnectionModal(true);
          }}
        />
        <ReconciliationCard items={reconciliation} loading={loading} />
        <RefundsCard
          refunds={refunds}
          loading={loading}
          onCreate={() => {
            setError(null);
            setRefundModal(true);
          }}
          onComplete={setCompletion}
        />
      </div>

      <Modal
        isOpen={connectionModal}
        toggle={() => !saving && setConnectionModal(false)}
        centered
      >
        <ModalHeader toggle={() => !saving && setConnectionModal(false)}>
          Conexão InfinitePay
        </ModalHeader>
        <ModalBody>
          <Alert color="warning">
            Alterar a InfiniteTag bloqueia novas cobranças até revalidação por
            cobrança real de R$ 1,00.
          </Alert>
          <div className="mb-3">
            <label className="form-label">
              InfiniteTag <span className="text-danger">*</span>
            </label>
            <Input
              value={publicIdentifier}
              onChange={(event) => setPublicIdentifier(event.target.value)}
              placeholder="$minha-tag"
            />
          </div>
          <div>
            <label className="form-label">Referência do segredo</label>
            <Input
              value={secretRef}
              onChange={(event) => setSecretRef(event.target.value)}
              placeholder="vault://payments/infinitepay"
            />
            <div className="form-text">
              Informe somente a referência no cofre; nunca cole uma API key
              aqui.
            </div>
          </div>
          <div className="form-check mt-3">
            <Input
              id="validationConfirmed"
              type="checkbox"
              className="form-check-input"
              checked={validationConfirmed}
              onChange={(event) => setValidationConfirmed(event.target.checked)}
            />
            <label className="form-check-label" htmlFor="validationConfirmed">
              Declaro que esta conta foi validada pelo administrador com uma
              cobrança real de R$ 1,00.
            </label>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            color="light"
            onClick={() => setConnectionModal(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            color="primary"
            onClick={() => void saveConnection()}
            disabled={
              saving || !publicIdentifier.trim() || !validationConfirmed
            }
          >
            {saving ? (
              <Spinner size="sm" className="me-1" />
            ) : (
              <i className="ri-save-line me-1" />
            )}
            Salvar
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={refundModal}
        toggle={() => !saving && setRefundModal(false)}
        centered
      >
        <ModalHeader toggle={() => !saving && setRefundModal(false)}>
          Novo estorno PIX
        </ModalHeader>
        <ModalBody>
          <Alert color="info">
            Registre aqui, faça o estorno no aplicativo InfinitePay e depois
            informe o resultado.
          </Alert>
          <div className="mb-3">
            <label className="form-label">
              ID da cobrança <span className="text-danger">*</span>
            </label>
            <Input
              value={chargeId}
              onChange={(event) => setChargeId(event.target.value)}
              placeholder="UUID da cobrança confirmada"
            />
          </div>
          <div className="mb-3">
            <label className="form-label">
              Valor <span className="text-danger">*</span>
            </label>
            <CurrencyInput value={refundAmount} onChange={setRefundAmount} />
          </div>
          <div>
            <label className="form-label">
              Motivo <span className="text-danger">*</span>
            </label>
            <Input
              type="textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            color="light"
            onClick={() => setRefundModal(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            color="primary"
            onClick={() => void createRefund()}
            disabled={
              saving ||
              !chargeId.trim() ||
              !refundAmount ||
              reason.trim().length < 3
            }
          >
            {saving ? (
              <Spinner size="sm" className="me-1" />
            ) : (
              <i className="ri-save-line me-1" />
            )}
            Registrar
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={completion !== null}
        toggle={() => !saving && setCompletion(null)}
        centered
      >
        <ModalHeader toggle={() => !saving && setCompletion(null)}>
          Registrar resultado do estorno
        </ModalHeader>
        <ModalBody>
          <Alert color="warning">
            Confirme somente após verificar o resultado no aplicativo
            InfinitePay.
          </Alert>
          <div className="mb-3">
            <label className="form-label">Resultado</label>
            <Input
              type="select"
              value={succeeded ? "succeeded" : "failed"}
              onChange={(event) =>
                setSucceeded(event.target.value === "succeeded")
              }
            >
              <option value="succeeded">Estorno concluído</option>
              <option value="failed">Estorno não concluído</option>
            </Input>
          </div>
          <div>
            <label className="form-label">
              Evidência/observação <span className="text-danger">*</span>
            </label>
            <Input
              type="textarea"
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              maxLength={500}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            color="light"
            onClick={() => setCompletion(null)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            color="primary"
            onClick={() => void completeRefund()}
            disabled={saving || resolutionNote.trim().length < 3}
          >
            {saving ? (
              <Spinner size="sm" className="me-1" />
            ) : (
              <i className="ri-save-line me-1" />
            )}
            Salvar resultado
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

function ConnectionCard({
  connection,
  loading,
  onConfigure,
}: {
  connection: PaymentsProviderConnection | null;
  loading: boolean;
  onConfigure: () => void;
}) {
  return (
    <Card className="mb-3">
      <CardHeader className="d-flex align-items-center justify-content-between">
        <div>
          <h4 className="card-title mb-1">Pagamentos</h4>
          <p className="text-muted mb-0">
            Conta recebedora do Checkout PIX integrado.
          </p>
        </div>
        <Button color="primary" onClick={onConfigure}>
          <i className="ri-plug-line me-1" />
          {connection ? "Alterar conexão" : "Configurar InfinitePay"}
        </Button>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
          </div>
        ) : connection ? (
          <div className="d-flex align-items-center justify-content-between border rounded p-3">
            <div>
              <div className="fw-semibold">InfinitePay</div>
              <div className="text-muted">
                InfiniteTag: ${connection.publicIdentifier.replace(/^\$/, "")}
              </div>
              <small className="text-muted">
                Atualizada em{" "}
                {new Date(connection.updatedAt).toLocaleString("pt-BR")}
              </small>
            </div>
            <Badge
              color={connection.status === "verified" ? "success" : "warning"}
              pill
            >
              {connection.status === "verified"
                ? "Verificada"
                : "Revalidação necessária"}
            </Badge>
          </div>
        ) : (
          <div className="text-center py-4 text-muted">
            Nenhuma conta InfinitePay configurada.
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ReconciliationCard({
  items,
  loading,
}: {
  items: PixReconciliationItem[];
  loading: boolean;
}) {
  return (
    <Card className="mb-3">
      <CardHeader>
        <h4 className="card-title mb-1">Reconciliação PIX</h4>
        <p className="text-muted mb-0">
          Cobranças preservadas enquanto a confirmação oficial é consultada.
        </p>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-4 text-muted">
            Nenhuma cobrança pendente de reconciliação.
          </div>
        ) : (
          <div className="table-responsive">
            <Table className="table-nowrap align-middle table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Referência</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Tentativas</th>
                  <th>Próxima verificação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.chargeId}>
                    <td>{item.merchantReference}</td>
                    <td>{money(item.amountMinor)}</td>
                    <td>
                      <Badge color="warning">
                        {item.status === "creation_outcome_unknown"
                          ? "Criação incerta"
                          : "Em reconciliação"}
                      </Badge>
                    </td>
                    <td>{item.verificationAttempts}</td>
                    <td>
                      {item.nextVerificationAt
                        ? new Date(item.nextVerificationAt).toLocaleString(
                            "pt-BR",
                          )
                        : "Aguardando worker"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RefundsCard({
  refunds,
  loading,
  onCreate,
  onComplete,
}: {
  refunds: PaymentRefund[];
  loading: boolean;
  onCreate: () => void;
  onComplete: (refund: PaymentRefund) => void;
}) {
  return (
    <Card>
      <CardHeader className="d-flex align-items-center justify-content-between">
        <div>
          <h4 className="card-title mb-1">Estornos PIX</h4>
          <p className="text-muted mb-0">
            Fluxo auditado para operação manual no aplicativo InfinitePay.
          </p>
        </div>
        <Button color="primary" onClick={onCreate}>
          <i className="ri-refund-2-line me-1" />
          Solicitar estorno
        </Button>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
          </div>
        ) : refunds.length === 0 ? (
          <div className="text-center py-4 text-muted">
            Nenhum estorno registrado.
          </div>
        ) : (
          <div className="table-responsive">
            <Table className="table-nowrap align-middle table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Cobrança</th>
                  <th>Valor</th>
                  <th>Motivo</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th className="text-end">Ações</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td>
                      <code>{refund.chargeId.slice(0, 8)}…</code>
                    </td>
                    <td>{money(refund.amountMinor)}</td>
                    <td>{refund.reason}</td>
                    <td>
                      <Badge color={statusView[refund.status].color}>
                        {statusView[refund.status].label}
                      </Badge>
                    </td>
                    <td>
                      {new Date(refund.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="text-end">
                      {refund.status === "requested" && (
                        <Button
                          size="sm"
                          color="secondary"
                          onClick={() => onComplete(refund)}
                        >
                          Registrar resultado
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
