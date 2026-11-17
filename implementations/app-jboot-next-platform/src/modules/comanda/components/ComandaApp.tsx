"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Nav, NavItem, NavLink, Spinner } from "reactstrap";
import {
  ComandaMeView,
  ComandaSessionExpiredError,
  PublicMenuProduct,
  PublicMenuResponse,
  comandaPublicApi
} from "../lib/comanda-public-api";
import { clearComandaSession, loadComandaSession, saveComandaSession, StoredComandaSession } from "../lib/comanda-session-storage";
import IdentifyForm from "./IdentifyForm";
import MenuView from "./MenuView";
import CartBar from "./CartBar";
import CartSheet, { CartItem } from "./CartSheet";
import OrderTracking from "./OrderTracking";
import { formatCurrency } from "../lib/format-currency";
import styles from "./ComandaPublic.module.css";

const ME_POLL_INTERVAL_MS = 8000;

type BootState = "loading" | "identify" | "ready";
type Tab = "menu" | "tracking";

export interface ComandaAppProps {
  tableToken: string;
}

function decodeTableNumber(tableToken: string): number | null {
  if (typeof atob === "undefined") {
    return null;
  }
  const payload = tableToken.split(".")[1];
  if (!payload) {
    return null;
  }
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const parsed = JSON.parse(atob(padded)) as { tableNumber?: unknown };
    return typeof parsed.tableNumber === "number" ? parsed.tableNumber : null;
  } catch {
    return null;
  }
}

function CartSummaryPanel({
  items,
  total,
  onIncrement,
  onDecrement,
  onSubmit
}: {
  items: CartItem[];
  total: number;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel enviar o pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className={styles.sidePanel}>
      <div className={styles.cartTitle}>
        <h2>Pedido atual</h2>
        <Badge color={items.length > 0 ? "primary" : "light"} className={items.length > 0 ? "" : "text-dark border"}>
          {items.reduce((sum, item) => sum + item.quantity, 0)} itens
        </Badge>
      </div>

      {items.length === 0 ? (
        <p className={styles.emptyState}>Nenhum item selecionado.</p>
      ) : (
        <>
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

          <div className={styles.cartTotal}>
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>

          {error && <Alert color="danger">{error}</Alert>}

          <Button className={`w-100 ${styles.primaryButton}`} onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Spinner size="sm" /> : "Enviar pedido"}
          </Button>
        </>
      )}
    </aside>
  );
}

export default function ComandaApp({ tableToken }: ComandaAppProps) {
  const [bootState, setBootState] = useState<BootState>("loading");
  const [session, setSession] = useState<StoredComandaSession | null>(null);
  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [me, setMe] = useState<ComandaMeView | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("menu");
  const [globalError, setGlobalError] = useState<string | null>(null);

  const resetToIdentify = useCallback(() => {
    clearComandaSession(tableToken);
    setSession(null);
    setMenu(null);
    setMe(null);
    setCart([]);
    setTab("menu");
    setBootState("identify");
  }, [tableToken]);

  const handleSessionExpired = useCallback(() => {
    setGlobalError("Sua comanda foi encerrada ou a sessao expirou. Identifique-se novamente para continuar.");
    resetToIdentify();
  }, [resetToIdentify]);

  const refreshMe = useCallback(
    async (activeSession: StoredComandaSession) => {
      try {
        const view = await comandaPublicApi.getMe(activeSession.token);
        setMe(view);
        return view;
      } catch (error) {
        if (error instanceof ComandaSessionExpiredError) {
          handleSessionExpired();
        }
        throw error;
      }
    },
    [handleSessionExpired]
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const stored = loadComandaSession(tableToken);
      if (!stored) {
        setBootState("identify");
        return;
      }

      try {
        const [view, menuResponse] = await Promise.all([
          comandaPublicApi.getMe(stored.token),
          comandaPublicApi.getMenu(stored.clientId)
        ]);
        if (cancelled) return;
        setSession(stored);
        setMe(view);
        setMenu(menuResponse);
        setBootState("ready");
      } catch {
        if (cancelled) return;
        clearComandaSession(tableToken);
        setBootState("identify");
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [tableToken]);

  useEffect(() => {
    if (bootState !== "ready" || !session || me?.status !== "aberta") {
      return;
    }

    const interval = setInterval(() => {
      refreshMe(session).catch(() => {
        // erro ja tratado em refreshMe (sessao expirada limpa o estado)
      });
    }, ME_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [bootState, session, me?.status, refreshMe]);

  async function handleIdentify(identity: { phone?: string; documentNumber?: string }) {
    const result = await comandaPublicApi.createSession(tableToken, identity);
    saveComandaSession(tableToken, result);

    const [view, menuResponse] = await Promise.all([
      comandaPublicApi.getMe(result.token),
      comandaPublicApi.getMenu(result.clientId)
    ]);

    setSession(result);
    setMe(view);
    setMenu(menuResponse);
    setGlobalError(null);
    setBootState("ready");
  }

  function handleIncrementFromMenu(product: PublicMenuProduct) {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  }

  function handleIncrementCartItem(productId: string) {
    setCart((prev) => prev.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)));
  }

  function handleDecrement(productId: string) {
    setCart((prev) =>
      prev
        .map((item) => (item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  async function handleSubmitOrder() {
    if (!session) return;
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

    try {
      await comandaPublicApi.createPedido(
        session.token,
        cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        idempotencyKey
      );
    } catch (error) {
      if (error instanceof ComandaSessionExpiredError) {
        handleSessionExpired();
      }
      throw error;
    }

    setCart([]);
    setCartOpen(false);
    setTab("tracking");
    await refreshMe(session);
  }

  async function handleCancelItem(itemId: string) {
    if (!session) return;
    try {
      await comandaPublicApi.cancelItem(session.token, itemId);
    } catch (error) {
      if (error instanceof ComandaSessionExpiredError) {
        handleSessionExpired();
      }
      throw error;
    }
    await refreshMe(session);
  }

  async function handleRequestClosing() {
    if (!session) return;
    try {
      await comandaPublicApi.requestClosing(session.token);
    } catch (error) {
      if (error instanceof ComandaSessionExpiredError) {
        handleSessionExpired();
      }
      throw error;
    }
  }

  const quantitiesByProductId = useMemo(
    () => Object.fromEntries(cart.map((item) => [item.productId, item.quantity])),
    [cart]
  );
  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0), [cart]);
  const decodedTableNumber = useMemo(() => decodeTableNumber(tableToken), [tableToken]);

  if (bootState === "loading") {
    return (
      <div className={styles.identifyShell}>
        <Spinner color="info" />
      </div>
    );
  }

  if (bootState === "identify") {
    return (
      <div>
        {globalError && (
          <div className="p-3">
            <Alert color="warning" toggle={() => setGlobalError(null)}>
              {globalError}
            </Alert>
          </div>
        )}
        <IdentifyForm onSubmit={handleIdentify} tableNumber={decodedTableNumber} />
      </div>
    );
  }

  if (!session || !me) {
    return null;
  }

  const pedidosCount = me.pedidos.reduce((sum, pedido) => sum + pedido.itens.length, 0);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brandRow}>
            <img src="/brand/jboot/logo-white.png" alt="JBoot" className={styles.brandLogo} />
            <span className={styles.brandBadge}>Comanda</span>
          </div>
          <span className={styles.tablePill}>
            <i className="ri-restaurant-2-line" />
            Mesa {session.tableNumber}
          </span>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div>
            <h1 className={styles.heroTitle}>Cardapio da mesa {session.tableNumber}</h1>
            <div className={styles.heroMeta}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Comanda</span>
                <span className={styles.metricValue}>{me.status === "aberta" ? "Aberta" : "Fechada"}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Total</span>
                <span className={styles.metricValue}>{formatCurrency(me.total)}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Pedidos</span>
                <span className={styles.metricValue}>{pedidosCount}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.content}>
        <main className={styles.mainPanel}>
          <Nav className={styles.tabs}>
            <NavItem>
              <NavLink className={tab === "menu" ? styles.tabButtonActive : styles.tabButton} active={tab === "menu"} onClick={() => setTab("menu")}>
                Cardapio
              </NavLink>
            </NavItem>
            <NavItem>
              <NavLink className={tab === "tracking" ? styles.tabButtonActive : styles.tabButton} active={tab === "tracking"} onClick={() => setTab("tracking")}>
                Meus pedidos
              </NavLink>
            </NavItem>
          </Nav>

          <div className={styles.panelBody}>
            {tab === "menu" && menu && (
              <MenuView
                menu={menu}
                quantitiesByProductId={quantitiesByProductId}
                onIncrement={handleIncrementFromMenu}
                onDecrement={handleDecrement}
              />
            )}

            {tab === "tracking" && (
              <OrderTracking me={me} onCancelItem={handleCancelItem} onRequestClosing={handleRequestClosing} />
            )}
          </div>
        </main>

        {tab === "menu" && (
          <CartSummaryPanel
            items={cart}
            total={cartTotal}
            onIncrement={handleIncrementCartItem}
            onDecrement={handleDecrement}
            onSubmit={handleSubmitOrder}
          />
        )}
      </div>

      {tab === "menu" && <CartBar itemCount={cartItemCount} total={cartTotal} onOpen={() => setCartOpen(true)} />}

      <CartSheet
        isOpen={cartOpen}
        items={cart}
        onClose={() => setCartOpen(false)}
        onIncrement={handleIncrementCartItem}
        onDecrement={handleDecrement}
        onSubmit={handleSubmitOrder}
      />
    </div>
  );
}
