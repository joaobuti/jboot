"use client";

import React, { useState } from "react";
import { Badge, Button } from "reactstrap";
import { PublicMenuProduct, PublicMenuResponse } from "../lib/comanda-public-api";
import { formatCurrency } from "../lib/format-currency";
import styles from "./ComandaPublic.module.css";

export interface MenuViewProps {
  menu: PublicMenuResponse;
  quantitiesByProductId: Record<string, number>;
  onIncrement: (product: PublicMenuProduct) => void;
  onDecrement: (productId: string) => void;
}

function ProductRow({
  product,
  quantity,
  onIncrement,
  onDecrement
}: {
  product: PublicMenuProduct;
  quantity: number;
  onIncrement: (product: PublicMenuProduct) => void;
  onDecrement: (productId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const orderable = product.queueType !== null;
  const queueLabel = product.queueType === "bar" ? "Bar" : product.queueType === "cozinha" ? "Cozinha" : null;
  const hasDescription = Boolean(product.description?.trim());

  return (
    <div className={styles.productCard}>
      <div className={styles.productRow}>
        <div className={styles.productInfo}>
          {product.imageUrl && (
            <img src={product.imageUrl} alt="" className={styles.productImage} loading="lazy" />
          )}
          <div>
            <div className={styles.productTitleLine}>
              <p className={styles.productName}>{product.name}</p>
              {hasDescription && (
                <button
                  type="button"
                  className={styles.expandButton}
                  onClick={() => setExpanded((current) => !current)}
                  aria-label={expanded ? `Ocultar detalhes de ${product.name}` : `Ver detalhes de ${product.name}`}
                >
                  <i className={expanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} />
                </button>
              )}
            </div>
            <div className={styles.productMeta}>
              <span className={styles.productPrice}>{formatCurrency(product.price)}</span>
              {queueLabel && <span className={styles.queueBadge}>{queueLabel}</span>}
            </div>
            {!orderable && (
              <Badge color="secondary" className="mt-1">
                Indisponivel para pedido
              </Badge>
            )}
          </div>
        </div>

        {orderable && (
          <div className={styles.quantityControl}>
            {quantity > 0 ? (
              <>
                <Button
                  className={styles.iconButton}
                  size="sm"
                  color="light"
                  onClick={() => onDecrement(product.id)}
                  aria-label={`Remover ${product.name}`}
                >
                  <i className="ri-subtract-line" />
                </Button>
                <span className={styles.quantity}>{quantity}</span>
              </>
            ) : (
              <>
                <span />
                <span />
              </>
            )}
            <Button
              className={styles.iconButton}
              size="sm"
              color="primary"
              onClick={() => onIncrement(product)}
              aria-label={`Adicionar ${product.name}`}
            >
              <i className="ri-add-line" />
            </Button>
          </div>
        )}
      </div>

      {expanded && hasDescription && (
        <p className={styles.productDescription}>{product.description}</p>
      )}
    </div>
  );
}

export default function MenuView({ menu, quantitiesByProductId, onIncrement, onDecrement }: MenuViewProps) {
  const hasUncategorized = menu.uncategorized.products.length > 0;

  if (menu.categories.length === 0 && !hasUncategorized) {
    return <p className={styles.emptyState}>Cardapio indisponivel no momento.</p>;
  }

  return (
    <div>
      {menu.categories.map((category) => (
        <section key={category.id} className="mb-4">
          <h2 className={styles.categoryTitle}>{category.name}</h2>
          {category.products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              quantity={quantitiesByProductId[product.id] ?? 0}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
            />
          ))}
        </section>
      ))}

      {hasUncategorized && (
        <section className="mb-4">
          <h2 className={styles.categoryTitle}>{menu.uncategorized.name}</h2>
          {menu.uncategorized.products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              quantity={quantitiesByProductId[product.id] ?? 0}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
            />
          ))}
        </section>
      )}
    </div>
  );
}
