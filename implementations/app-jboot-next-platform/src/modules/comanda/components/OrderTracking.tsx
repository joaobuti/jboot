"use client";

import React, { useState } from "react";
import { Badge, Button, Spinner } from "reactstrap";
import { ComandaItemStatus, ComandaItemView, ComandaMeView } from "../lib/comanda-public-api";
import { formatCurrency } from "../lib/format-currency";
import styles from "./ComandaPublic.module.css";

export interface OrderTrackingProps {
  me: ComandaMeView;
  onCancelItem: (itemId: string) => Promise<void>;
  onRequestClosing: () => Promise<void>;
}

const STATUS_LABEL: Record<ComandaItemStatus, string> = {
  pendente: "Aguardando confirmacao",
  em_producao: "Em preparo",
  pronto: "Pronto",
  liberado_para_entrega: "A caminho da mesa",
  cancelado: "Cancelado"
};

const STATUS_COLOR: Record<ComandaItemStatus, string> = {
  pendente: "secondary",
  em_producao: "warning",
  pronto: "info",
  liberado_para_entrega: "success",
  cancelado: "danger"
};

function ItemRow({ item, onCancelItem }: { item: ComandaItemView; onCancelItem: (itemId: string) => Promise<void> }) {
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      await onCancelItem(item.id);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className={styles.trackRow}>
      <div>
        <div className={item.status === "cancelado" ? "text-decoration-line-through text-muted" : "fw-medium"}>
          {item.quantity}x {item.productName}
        </div>
        <Badge color={STATUS_COLOR[item.status]} className="mt-1">
          {STATUS_LABEL[item.status]}
        </Badge>
      </div>
      <div className="d-flex align-items-center justify-content-end gap-2">
        <span className="text-muted small">{formatCurrency(Number(item.unitPrice) * Number(item.quantity))}</span>
        {item.status === "pendente" && (
          <Button size="sm" color="danger" outline onClick={handleCancel} disabled={cancelling}>
            {cancelling ? <Spinner size="sm" /> : "Cancelar"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function OrderTracking({ me, onCancelItem, onRequestClosing }: OrderTrackingProps) {
  const [requesting, setRequesting] = useState(false);
  const [closingRequested, setClosingRequested] = useState(false);

  async function handleRequestClosing() {
    setRequesting(true);
    try {
      await onRequestClosing();
      setClosingRequested(true);
    } finally {
      setRequesting(false);
    }
  }

  const hasItems = me.pedidos.some((pedido) => pedido.itens.length > 0);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className={styles.categoryTitle}>Mesa {me.tableNumber}</h2>
        <Badge color={me.status === "aberta" ? "success" : "secondary"}>
          {me.status === "aberta" ? "Comanda aberta" : "Comanda fechada"}
        </Badge>
      </div>

      {!hasItems && <p className={styles.emptyState}>Voce ainda nao enviou nenhum pedido.</p>}

      {me.pedidos
        .filter((pedido) => pedido.itens.length > 0)
        .map((pedido) => (
          <section key={pedido.id} className="mb-3">
            <div className="text-muted small mb-1">
              Pedido enviado as {new Date(pedido.submittedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            {pedido.itens.map((item) => (
              <ItemRow key={item.id} item={item} onCancelItem={onCancelItem} />
            ))}
          </section>
        ))}

      <div className={styles.trackTotal}>
        <span>Total da comanda</span>
        <span>{formatCurrency(me.total)}</span>
      </div>

      {me.status === "aberta" && (
        <Button color="primary" outline className="w-100 fw-semibold" onClick={handleRequestClosing} disabled={requesting || closingRequested}>
          {requesting ? <Spinner size="sm" /> : closingRequested ? "Fechamento solicitado" : "Solicitar fechamento da conta"}
        </Button>
      )}
    </div>
  );
}
