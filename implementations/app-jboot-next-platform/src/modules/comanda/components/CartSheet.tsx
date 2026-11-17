"use client";

import React, { useState } from "react";
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { formatCurrency } from "../lib/format-currency";
import styles from "./ComandaPublic.module.css";

export interface CartItem {
  productId: string;
  name: string;
  price: string;
  quantity: number;
}

export interface CartSheetProps {
  isOpen: boolean;
  items: CartItem[];
  onClose: () => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onSubmit: () => Promise<void>;
}

export default function CartSheet({ isOpen, items, onClose, onIncrement, onDecrement, onSubmit }: CartSheetProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit();
    } catch {
      setError("Nao foi possivel enviar o pedido. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered>
      <ModalHeader toggle={onClose}>Seu pedido</ModalHeader>
      <ModalBody>
        {items.length === 0 && <p className="text-muted mb-0">Seu carrinho esta vazio.</p>}

        {items.map((item) => (
          <div key={item.productId} className={styles.cartLine}>
            <div>
              <p className={styles.cartItemName}>{item.name}</p>
              <div className={styles.cartItemMeta}>{formatCurrency(item.price)} un.</div>
            </div>
            <div className={styles.quantityControl}>
              <Button className={styles.iconButton} size="sm" color="light" onClick={() => onDecrement(item.productId)} aria-label={`Remover ${item.name}`}>
                <i className="ri-subtract-line" />
              </Button>
              <span className={styles.quantity}>{item.quantity}</span>
              <Button className={styles.iconButton} size="sm" color="light" onClick={() => onIncrement(item.productId)} aria-label={`Adicionar ${item.name}`}>
                <i className="ri-add-line" />
              </Button>
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <div className={styles.cartTotal}>
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        )}

        {error && (
          <Alert color="danger" className="mt-3 mb-0">
            {error}
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={submitting}>
          Continuar pedindo
        </Button>
        <Button className={styles.primaryButton} onClick={handleSubmit} disabled={items.length === 0 || submitting}>
          {submitting ? <Spinner size="sm" /> : "Enviar pedido"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
