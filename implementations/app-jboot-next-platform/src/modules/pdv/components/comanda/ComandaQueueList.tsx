"use client";

import React from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Spinner, Table } from "reactstrap";
import { ComandaAdminItem } from "@/modules/pdv/lib/comanda-admin-api";

function formatTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

interface ComandaQueueListProps {
  title: string;
  icon: string;
  items: ComandaAdminItem[];
  loading: boolean;
  error: string | null;
  emptyIcon: string;
  emptyMessage: string;
  actionLabel?: string;
  actionIcon?: string;
  actionColor?: string;
  actionLoadingId?: string | null;
  onAction?: (item: ComandaAdminItem) => void;
  onCancel?: (item: ComandaAdminItem) => void;
  showPosition?: boolean;
  timestampField?: "createdAt" | "encaminhadoAt" | "finalizadoAt";
  timestampLabel?: string;
}

export function ComandaQueueList({
  title,
  icon,
  items,
  loading,
  error,
  emptyIcon,
  emptyMessage,
  actionLabel,
  actionIcon,
  actionColor = "primary",
  actionLoadingId = null,
  onAction,
  onCancel,
  showPosition = false,
  timestampField = "createdAt",
  timestampLabel = "Horário"
}: ComandaQueueListProps) {
  const showActionsColumn = Boolean(onAction || onCancel);
  return (
    <Card>
      <CardHeader className="d-flex align-items-center justify-content-between">
        <h6 className="mb-0">
          <i className={`${icon} me-2`} />
          {title}
        </h6>
        <Badge color="secondary" pill>{items.length}</Badge>
      </CardHeader>
      <CardBody className="p-0">
        {error && <Alert color="danger" className="m-3 mb-0 py-2 small">{error}</Alert>}

        {loading ? (
          <div className="text-center py-5">
            <Spinner color="primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className={`${emptyIcon} display-5 d-block mb-2`} />
            {emptyMessage}
          </div>
        ) : (
          <Table hover responsive className="mb-0 align-middle">
            <thead>
              <tr>
                {showPosition && <th className="text-center">#</th>}
                <th>Mesa</th>
                <th>Item</th>
                <th className="text-center">Qtd.</th>
                <th>{timestampLabel}</th>
                {showActionsColumn && <th className="text-end">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  {showPosition && <td className="text-center text-muted">{index + 1}</td>}
                  <td>
                    <Badge color="light" className="text-dark border">Mesa {item.tableNumber}</Badge>
                  </td>
                  <td>
                    <div className="fw-medium">{item.productName}</div>
                    {item.notes && <div className="text-muted small">{item.notes}</div>}
                  </td>
                  <td className="text-center">{Number(item.quantity)}</td>
                  <td className="text-muted small">{formatTime(item[timestampField])}</td>
                  {showActionsColumn && (
                    <td className="text-end">
                      <div className="d-flex gap-1 justify-content-end">
                        {onCancel && (
                          <Button
                            size="sm"
                            color="danger"
                            outline
                            disabled={actionLoadingId === item.id}
                            onClick={() => onCancel(item)}
                          >
                            <i className="ri-close-circle-line" />
                          </Button>
                        )}
                        {onAction && (
                          <Button
                            size="sm"
                            color={actionColor}
                            disabled={actionLoadingId === item.id}
                            onClick={() => onAction(item)}
                          >
                            {actionLoadingId === item.id
                              ? <Spinner size="sm" />
                              : <i className={`${actionIcon} me-1`} />}
                            {actionLabel}
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
