"use client";

import React from "react";
import { Button } from "reactstrap";
import { formatCurrency } from "../lib/format-currency";
import styles from "./ComandaPublic.module.css";

export interface CartBarProps {
  itemCount: number;
  total: number;
  onOpen: () => void;
}

export default function CartBar({ itemCount, total, onOpen }: CartBarProps) {
  if (itemCount === 0) {
    return null;
  }

  return (
    <div className={`${styles.mobileCartBar} ${styles.mobileOnly}`}>
      <Button className={`w-100 d-flex justify-content-between align-items-center ${styles.primaryButton}`} onClick={onOpen}>
        <span>{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
        <span>Ver carrinho - {formatCurrency(total)}</span>
      </Button>
    </div>
  );
}
