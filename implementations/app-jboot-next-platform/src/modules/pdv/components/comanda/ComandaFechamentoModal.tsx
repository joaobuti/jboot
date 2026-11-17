"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
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
import { ComandaDetail, ComandaPaymentMethod, comandaAdminApi } from "@/modules/pdv/lib/comanda-admin-api";

const PAYMENT_METHODS: { value: ComandaPaymentMethod; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito", label: "Cartão de débito" },
  { value: "pix", label: "Pix" },
  { value: "outro", label: "Outro" }
];

export function formatCurrency(value: string): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Parte igual e materializada aqui, em valor absoluto, antes de ir para o
 * backend: quem paga quita um valor fixo, nunca um percentual — a comanda
 * continua aberta e o total pode subir para quem ficou na mesa.
 */
function splitValue(saldo: number, parts: number): number {
  return Math.min(saldo, Math.round((saldo * 100) / parts) / 100);
}

interface ComandaFechamentoModalProps {
  /** `null` mantem o modal fechado. */
  comandaId: string | null;
  tableNumber?: number;
  onCancel: () => void;
  onClosed: (comandaId: string) => void;
}

/**
 * Modal de fechamento com confirmacao de pagamento, compartilhado pela tela
 * de Fechamento (Sprint 4) e pelo painel de mesa do mapa do salao (Sprint 8).
 * A partir da Sprint 9 aceita tambem recebimento parcial: cada recebimento
 * vira uma venda derivada e a comanda so fecha quando o saldo zera.
 */
export function ComandaFechamentoModal({
  comandaId,
  tableNumber,
  onCancel,
  onClosed
}: ComandaFechamentoModalProps) {
  const [detail, setDetail] = useState<ComandaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<ComandaPaymentMethod>("dinheiro");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
  const [amountInput, setAmountInput] = useState("");

  const load = useCallback(async (id: string) => {
    setDetailError(null);
    setConfirmError(null);
    setDetailLoading(true);
    try {
      const result = await comandaAdminApi.comandaDetail(id);
      setDetail(result);
      // Comanda que ja recebeu parcial nao tem caminho de "receber total":
      // o backend recusa o fechamento direto para nao cobrar duas vezes.
      const jaDividida = result.saldo.pagamentos.length > 0;
      setSplit(jaDividida);
      setAmountInput(jaDividida ? result.saldo.saldo : "");
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Erro ao carregar detalhes da comanda");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (comandaId) {
      setDetail(null);
      setPaymentMethod("dinheiro");
      void load(comandaId);
    }
  }, [comandaId, load]);

  async function confirmFechamentoTotal() {
    if (!comandaId) return;
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      await comandaAdminApi.fechar(comandaId, paymentMethod);
      onClosed(comandaId);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Erro ao fechar comanda");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function receberValor() {
    if (!comandaId) return;
    const amount = Number(amountInput.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setConfirmError("Informe um valor maior que zero.");
      return;
    }
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      const result = await comandaAdminApi.registrarPagamento(comandaId, amount, paymentMethod);
      if (result.fechada) {
        onClosed(comandaId);
        return;
      }
      await load(comandaId);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Erro ao registrar pagamento");
    } finally {
      setConfirmLoading(false);
    }
  }

  const activeItens = detail?.itens.filter((item) => item.status !== "cancelado") ?? [];
  const mesa = tableNumber ?? detail?.comanda.tableNumber;
  const saldo = detail ? Number(detail.saldo.saldo) : 0;
  const jaDividida = (detail?.saldo.pagamentos.length ?? 0) > 0;

  return (
    <Modal isOpen={!!comandaId} toggle={onCancel} centered size="lg">
      <ModalHeader toggle={onCancel}>Fechar comanda — Mesa {mesa}</ModalHeader>
      <ModalBody>
        {detailError && <Alert color="danger" className="py-2 small">{detailError}</Alert>}
        {confirmError && <Alert color="danger" className="py-2 small">{confirmError}</Alert>}

        {detailLoading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
          </div>
        ) : detail ? (
          <>
            <div className="mb-2">
              <span className="fw-medium">{detail.comanda.customerName}</span>
              <span className="text-muted small ms-2">
                {detail.comanda.customerPhone ?? detail.comanda.customerDocumentNumber}
              </span>
            </div>
            <Table size="sm" className="mb-3">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-center">Qtd.</th>
                  <th>Status</th>
                  <th className="text-end">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {activeItens.map((item) => (
                  <tr key={item.id}>
                    <td>{item.productName}</td>
                    <td className="text-center">{Number(item.quantity)}</td>
                    <td className="text-muted small">{item.status}</td>
                    <td className="text-end">
                      {formatCurrency(String(Number(item.unitPrice) * Number(item.quantity)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="d-flex justify-content-between align-items-center">
              <strong>Total</strong>
              <strong>{formatCurrency(detail.saldo.total)}</strong>
            </div>

            {detail.saldo.pagamentos.length > 0 && (
              <div className="mt-3">
                <div className="text-uppercase text-muted small fw-medium border-bottom pb-1 mb-2">
                  Recebimentos
                </div>
                {detail.saldo.pagamentos.map((pagamento) => (
                  <div key={pagamento.saleId} className="d-flex justify-content-between small py-1">
                    <span>
                      Venda #{pagamento.saleNumber}
                      <span className="text-muted ms-2">
                        {PAYMENT_METHODS.find((m) => m.value === pagamento.paymentMethod)?.label ??
                          pagamento.paymentMethod}
                      </span>
                    </span>
                    <span>{formatCurrency(pagamento.amount)}</span>
                  </div>
                ))}
                <div className="d-flex justify-content-between align-items-center mt-2">
                  <span className="fw-medium">Saldo em aberto</span>
                  <Badge color={saldo > 0 ? "warning" : "success"} className="fs-6">
                    {formatCurrency(detail.saldo.saldo)}
                  </Badge>
                </div>
              </div>
            )}

            <div className="mt-3">
              {!jaDividida && (
                <ButtonGroup size="sm" className="mb-3">
                  <Button color={split ? "light" : "primary"} onClick={() => setSplit(false)}>
                    Receber total
                  </Button>
                  <Button
                    color={split ? "primary" : "light"}
                    onClick={() => {
                      setSplit(true);
                      setAmountInput(detail.saldo.saldo);
                    }}
                  >
                    Dividir
                  </Button>
                </ButtonGroup>
              )}

              <Form>
                {split && (
                  <FormGroup>
                    <Label for="paymentAmount">Valor recebido agora</Label>
                    <div className="d-flex gap-2">
                      <Input
                        id="paymentAmount"
                        type="text"
                        inputMode="decimal"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                      />
                      <ButtonGroup size="sm">
                        {[2, 3, 4].map((parts) => (
                          <Button
                            key={parts}
                            color="light"
                            onClick={() => setAmountInput(splitValue(saldo, parts).toFixed(2))}
                            title={`Dividir o saldo em ${parts}`}
                          >
                            /{parts}
                          </Button>
                        ))}
                        <Button color="light" onClick={() => setAmountInput(saldo.toFixed(2))}>
                          Tudo
                        </Button>
                      </ButtonGroup>
                    </div>
                    <div className="form-text">
                      Saldo em aberto: {formatCurrency(String(saldo))}. A comanda continua aberta e aceitando pedidos
                      enquanto houver saldo.
                    </div>
                  </FormGroup>
                )}

                <FormGroup>
                  <Label for="paymentMethod">Forma de pagamento recebida</Label>
                  <Input
                    id="paymentMethod"
                    type="select"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as ComandaPaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>{method.label}</option>
                    ))}
                  </Input>
                </FormGroup>
              </Form>
            </div>

            <p className="text-muted small mb-0">
              Confirmar aqui indica que o pagamento já foi recebido (no caixa ou impresso para cobrança na mesa).
              Emissão de nota fiscal continua manual, no fluxo de vendas do PDV.
            </p>
          </>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button color="light" onClick={onCancel} disabled={confirmLoading}>Voltar</Button>
        {split ? (
          <Button
            color="success"
            onClick={() => void receberValor()}
            disabled={confirmLoading || detailLoading || activeItens.length === 0}
          >
            {confirmLoading ? <Spinner size="sm" className="me-1" /> : <i className="ri-cash-line me-1" />}
            Confirmar Recebimento
          </Button>
        ) : (
          <Button
            color="success"
            onClick={() => void confirmFechamentoTotal()}
            disabled={confirmLoading || detailLoading || activeItens.length === 0}
          >
            {confirmLoading ? <Spinner size="sm" className="me-1" /> : <i className="ri-check-line me-1" />}
            Confirmar Pagamento e Fechar
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
