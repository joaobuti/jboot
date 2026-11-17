"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
  Input,
  InputGroup,
  InputGroupText,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Nav,
  NavItem,
  NavLink,
  Row,
  Spinner,
  Table
} from "reactstrap";
import { CurrencyInput } from "@/components/Common/CurrencyInput";
import {
  CashierSummary,
  NfResult,
  PaymentMethod,
  PdvCashier,
  PdvSale,
  PdvSaleItem,
  PdvSalePayment,
  pdvApi
} from "@/modules/pdv/lib/pdv-api";
import { CatalogCategory, CatalogProduct, catalogApi } from "@/modules/pdv/lib/catalog-api";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  pix: "PIX",
  outro: "Outro"
};

function fmt(value: string | number): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface DestinatarioForm {
  razaoSocial: string;
  cnpj: string;
  cpf: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  codigoMunicipio: string;
}

const emptyDestinatario: DestinatarioForm = {
  razaoSocial: "", cnpj: "", cpf: "",
  logradouro: "", numero: "", bairro: "",
  municipio: "", uf: "", cep: "", codigoMunicipio: ""
};

export function PdvCashierPage() {
  // --- caixa ---
  const [cashiers, setCashiers] = useState<PdvCashier[]>([]);
  const [cashierLoading, setCashierLoading] = useState(true);
  const [openCashierModal, setOpenCashierModal] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [cashierError, setCashierError] = useState<string | null>(null);

  // --- fechar caixa modal ---
  const [closeCashierModal, setCloseCashierModal] = useState(false);
  const [cashierSummary, setCashierSummary] = useState<CashierSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [countedBalance, setCountedBalance] = useState("");
  const [cashMovementModal, setCashMovementModal] = useState(false);
  const [cashMovementType, setCashMovementType] = useState<"sangria" | "suprimento">("sangria");
  const [cashMovementAmount, setCashMovementAmount] = useState("");
  const [cashMovementReason, setCashMovementReason] = useState("");

  // --- venda corrente ---
  const [sale, setSale] = useState<PdvSale | null>(null);
  const [saleItems, setSaleItems] = useState<(PdvSaleItem & { productName: string })[]>([]);
  const [salePayments, setSalePayments] = useState<PdvSalePayment[]>([]);

  // --- venda concluída (sem limpar tela) ---
  const [completedSale, setCompletedSale] = useState<PdvSale | null>(null);
  const [completedSaleItems, setCompletedSaleItems] = useState<(PdvSaleItem & { productName: string })[]>([]);
  const [completedSalePayments, setCompletedSalePayments] = useState<PdvSalePayment[]>([]);
  const [cancelCompletedModal, setCancelCompletedModal] = useState(false);
  const [cancelCompletedReason, setCancelCompletedReason] = useState("");

  // --- desconto ---
  const [discountModal, setDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<"value" | "percent">("value");
  const [discountInput, setDiscountInput] = useState("");
  const [discountError, setDiscountError] = useState<string | null>(null);

  // --- emissão NF ---
  const [nfModal, setNfModal] = useState(false);
  const [nfType, setNfType] = useState<"nfce" | "nfe">("nfce");
  const [cpfConsumidor, setCpfConsumidor] = useState("");
  const [destinatario, setDestinatario] = useState<DestinatarioForm>(emptyDestinatario);
  const [nfResult, setNfResult] = useState<NfResult | null>(null);
  const [nfLoading, setNfLoading] = useState(false);
  const [nfError, setNfError] = useState<string | null>(null);
  const [nfSuggestionApplied, setNfSuggestionApplied] = useState(false);

  // --- catálogo / buscar venda ---
  const [catalogTab, setCatalogTab] = useState<"catalogo" | "buscar_venda">("catalogo");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openSales, setOpenSales] = useState<PdvSale[]>([]);
  const [openSalesLoading, setOpenSalesLoading] = useState(false);

  // --- pagamento ---
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("dinheiro");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [pixModal, setPixModal] = useState(false);
  const [pixChargeId, setPixChargeId] = useState<string | null>(null);
  const [pixCheckoutUrl, setPixCheckoutUrl] = useState<string | null>(null);
  const [pixStatus, setPixStatus] = useState<string>("idle");
  const [pixError, setPixError] = useState<string | null>(null);

  // --- ações ---
  const [actionLoading, setActionLoading] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  const productMapRef = useRef<Map<string, CatalogProduct>>(new Map());
  const activeCashier = cashiers[0] ?? null;

  useEffect(() => {
    if (!pixModal || !sale || !pixChargeId || pixStatus === "received") return;
    const interval = window.setInterval(async () => {
      try {
        const result = await pdvApi.sales.verifyPix(sale.id, pixChargeId);
        setPixStatus(result.status);
        if (result.status === "received" && result.payment) {
          setSalePayments((current) => current.some((item) => item.id === result.payment?.id)
            ? current
            : [...current, result.payment!]);
          setPaymentAmount("");
        }
      } catch (error) {
        setPixError(error instanceof Error ? error.message : "Não foi possível consultar o pagamento");
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [pixModal, pixChargeId, pixStatus, sale]);

  const loadCatalog = useCallback(async () => {
    setProductsLoading(true);
    try {
      const [prodResult, catResult] = await Promise.all([
        catalogApi.products.list({ limit: 200, offset: 0, status: "active", visibleInPdv: true }),
        catalogApi.categories.list({ limit: 200, offset: 0, status: "active" })
      ]);
      setProducts(prodResult.data);
      setCategories(catResult.data);
      productMapRef.current = new Map(prodResult.data.map((p) => [p.id, p]));
    } catch {
      // catálogo vazio — não falha a sessão
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const loadOpenSales = useCallback(async () => {
    setOpenSalesLoading(true);
    try {
      const result = await pdvApi.sales.list({ status: "open", limit: 50 });
      setOpenSales(result.data);
    } catch {
      setOpenSales([]);
    } finally {
      setOpenSalesLoading(false);
    }
  }, []);

  useEffect(() => {
    setCashierLoading(true);
    pdvApi.cashier
      .current()
      .then((list) => setCashiers(list))
      .catch(() => setCashiers([]))
      .finally(() => setCashierLoading(false));
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (catalogTab === "buscar_venda") void loadOpenSales();
  }, [catalogTab, loadOpenSales]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q);
      const matchesCategory = !selectedCategory || p.categoryId === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  const saleSubtotal = useMemo(
    () => saleItems.reduce((acc, i) => acc + Number(i.quantity) * Number(i.unitPrice), 0),
    [saleItems]
  );
  const saleDiscount = sale ? Number(sale.discount) : 0;
  const saleTotal = Math.max(0, saleSubtotal - saleDiscount);
  const paidTotal = useMemo(() => salePayments.reduce((acc, p) => acc + Number(p.amount), 0), [salePayments]);
  const remaining = Math.max(0, saleTotal - paidTotal);
  const change = Math.max(0, paidTotal - saleTotal);
  const canFinish = saleItems.length > 0 && paidTotal >= saleTotal;
  const countedBalanceValue = parseFloat(countedBalance) || 0;
  const expectedClosingBalance = cashierSummary ? Number(cashierSummary.expectedClosingBalance) : 0;
  const closingDifference = countedBalance ? countedBalanceValue - expectedClosingBalance : 0;

  async function handleOpenCashier() {
    const balance = parseFloat(openingBalance) || 0;
    setCashierError(null);
    setActionLoading(true);
    try {
      const cashier = await pdvApi.cashier.open({ openingBalance: balance });
      setCashiers((prev) => [cashier, ...prev]);
      setOpenCashierModal(false);
      setOpeningBalance("");
    } catch (err) {
      setCashierError(err instanceof Error ? err.message : "Erro ao abrir caixa");
    } finally {
      setActionLoading(false);
    }
  }

  async function openCloseCashierModal() {
    if (!activeCashier) return;
    setCloseCashierModal(true);
    setSummaryLoading(true);
    setCashierSummary(null);
    setCountedBalance("");
    try {
      const summary = await pdvApi.cashier.summary(activeCashier.id);
      setCashierSummary(summary);
      setCountedBalance(String(Number(summary.expectedClosingBalance)));
    } catch {
      // exibe modal sem resumo
    } finally {
      setSummaryLoading(false);
    }
  }

  async function confirmCloseCashier() {
    if (!activeCashier || !countedBalance) return;
    setCashierError(null);
    setActionLoading(true);
    try {
      await pdvApi.cashier.close(activeCashier.id, { countedBalance: countedBalanceValue });
      setCashiers((prev) => prev.filter((c) => c.id !== activeCashier.id));
      setSale(null);
      setSaleItems([]);
      setSalePayments([]);
      setCompletedSale(null);
      setCompletedSaleItems([]);
      setCompletedSalePayments([]);
      setCloseCashierModal(false);
      setCashierSummary(null);
      setCountedBalance("");
    } catch (err) {
      setCashierError(err instanceof Error ? err.message : "Erro ao fechar caixa");
      setCloseCashierModal(false);
    } finally {
      setActionLoading(false);
    }
  }

  function openCashMovement(type: "sangria" | "suprimento") {
    setCashMovementType(type);
    setCashMovementAmount("");
    setCashMovementReason("");
    setCashierError(null);
    setCashMovementModal(true);
  }

  async function confirmCashMovement() {
    if (!activeCashier) return;
    const amount = parseFloat(cashMovementAmount) || 0;
    if (amount <= 0 || cashMovementReason.trim().length < 3) return;
    setCashierError(null);
    setActionLoading(true);
    try {
      await pdvApi.cashier.movement(activeCashier.id, {
        type: cashMovementType,
        amount,
        reason: cashMovementReason.trim()
      });
      setCashMovementModal(false);
      setCashMovementAmount("");
      setCashMovementReason("");
    } catch (err) {
      setCashierError(err instanceof Error ? err.message : "Erro ao registrar movimentação");
    } finally {
      setActionLoading(false);
    }
  }

  async function ensureSale(): Promise<string> {
    if (sale) return sale.id;
    const newSale = await pdvApi.sales.create(activeCashier?.id);
    setSale(newSale);
    return newSale.id;
  }

  async function addToCart(product: CatalogProduct) {
    if (!activeCashier || completedSale) return;
    setSaleError(null);
    setActionLoading(true);
    try {
      const saleId = await ensureSale();
      const item = await pdvApi.sales.addItem(saleId, {
        productId: product.id,
        quantity: 1,
        unitPrice: Number(product.salePrice)
      });
      setSaleItems((prev) => [...prev, { ...item, productName: product.name }]);
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "Erro ao adicionar item");
    } finally {
      setActionLoading(false);
    }
  }

  async function updateItemQty(itemId: string, newQty: number) {
    if (!sale) return;
    if (newQty <= 0) {
      await removeFromCart(itemId);
      return;
    }
    setSaleError(null);
    setActionLoading(true);
    try {
      const updated = await pdvApi.sales.updateItem(sale.id, itemId, { quantity: newQty });
      setSaleItems((prev) => prev.map((i) => i.id === itemId ? { ...updated, productName: i.productName } : i));
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "Erro ao atualizar quantidade");
    } finally {
      setActionLoading(false);
    }
  }

  async function removeFromCart(itemId: string) {
    if (!sale) return;
    setSaleError(null);
    setActionLoading(true);
    try {
      await pdvApi.sales.removeItem(sale.id, itemId);
      setSaleItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "Erro ao remover item");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApplyDiscount() {
    if (!sale) return;
    const amount = parseFloat(discountType === "value" ? discountInput : discountInput) || 0;
    if (amount <= 0) return;
    setDiscountError(null);
    setActionLoading(true);
    try {
      const updated = await pdvApi.sales.applyDiscount(sale.id, { discountType, amount });
      setSale((prev) => prev ? { ...prev, discount: updated.discount, total: updated.total } : null);
      setDiscountModal(false);
      setDiscountInput("");
    } catch (err) {
      setDiscountError(err instanceof Error ? err.message : "Erro ao aplicar desconto");
    } finally {
      setActionLoading(false);
    }
  }

  async function addPayment() {
    if (!sale) return;
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) return;
    setSaleError(null);
    setActionLoading(true);
    try {
      if (paymentMethod === "pix") {
        setPixModal(true);
        setPixStatus("creating");
        setPixError(null);
        setPixChargeId(null);
        setPixCheckoutUrl(null);
        const result = await pdvApi.sales.initiatePix(sale.id, amount);
        setPixChargeId(result.chargeId);
        setPixCheckoutUrl(result.checkoutUrl ?? null);
        setPixStatus(result.status);
        if (result.status === "received" && result.payment) {
          setSalePayments((current) => current.some((item) => item.id === result.payment?.id)
            ? current
            : [...current, result.payment!]);
          setPaymentAmount("");
        }
        return;
      }
      const payment = await pdvApi.sales.addPayment(sale.id, { paymentMethod, amount });
      setSalePayments((prev) => [...prev, payment]);
      setPaymentAmount("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao registrar pagamento";
      if (paymentMethod === "pix") {
        setPixStatus("failed");
        setPixError(message);
      } else {
        setSaleError(message);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function completeSale() {
    if (!sale || !canFinish) return;
    setSaleError(null);
    setActionLoading(true);
    try {
      const completed = await pdvApi.sales.complete(sale.id);
      setCompletedSale(completed);
      setCompletedSaleItems(saleItems);
      setCompletedSalePayments(salePayments);
      setSale(null);
      setSaleItems([]);
      setSalePayments([]);
      setPaymentAmount("");
      setNfResult(null);
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "Erro ao finalizar venda");
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelSale() {
    if (!sale) return;
    if (!confirm("Cancelar a venda atual?")) return;
    setSaleError(null);
    setActionLoading(true);
    try {
      await pdvApi.sales.cancel(sale.id);
      setSale(null);
      setSaleItems([]);
      setSalePayments([]);
      setPaymentAmount("");
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "Erro ao cancelar venda");
    } finally {
      setActionLoading(false);
    }
  }

  function startNewSale() {
    setCompletedSale(null);
    setCompletedSaleItems([]);
    setCompletedSalePayments([]);
    setNfResult(null);
    setSale(null);
    setSaleItems([]);
    setSalePayments([]);
    setPaymentAmount("");
    setSaleError(null);
  }

  function printReceipt() {
    window.print();
  }

  async function confirmCancelCompletedSale() {
    if (!completedSale || cancelCompletedReason.trim().length < 3) return;
    setSaleError(null);
    setActionLoading(true);
    try {
      await pdvApi.sales.cancel(completedSale.id, { reason: cancelCompletedReason.trim() });
      setCancelCompletedModal(false);
      setCancelCompletedReason("");
      setCompletedSale({ ...completedSale, status: "cancelled" });
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "Erro ao estornar venda");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSearchEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !search.trim() || completedSale) return;
    const q = search.trim().toLowerCase();
    const byBarcode = products.find((p) => (p.barcode ?? "").toLowerCase() === q);
    const bySku = products.find((p) => (p.sku ?? "").toLowerCase() === q);
    const match = byBarcode ?? bySku;
    if (match) {
      await addToCart(match);
      setSearch("");
    }
  }

  async function loadOpenSaleToCart(saleId: string) {
    setSaleError(null);
    setActionLoading(true);
    try {
      const fullSale = await pdvApi.sales.get(saleId);
      setSale(fullSale);
      const withNames = (fullSale.items ?? []).map((item) => ({
        ...item,
        productName: productMapRef.current.get(item.productId)?.name ?? "Produto"
      }));
      setSaleItems(withNames);
      setSalePayments(fullSale.payments ?? []);
      setCatalogTab("catalogo");
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "Erro ao carregar venda");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEmitNf() {
    if (!completedSale) return;
    setNfError(null);
    setNfLoading(true);
    try {
      const dest = nfType === "nfe" && destinatario.razaoSocial
        ? {
            razaoSocial: destinatario.razaoSocial,
            cnpj: destinatario.cnpj || undefined,
            cpf: destinatario.cpf || undefined,
            endereco: destinatario.logradouro ? {
              logradouro: destinatario.logradouro,
              numero: destinatario.numero,
              bairro: destinatario.bairro,
              municipio: destinatario.municipio,
              uf: destinatario.uf,
              cep: destinatario.cep,
              codigoMunicipio: destinatario.codigoMunicipio
            } : undefined
          }
        : undefined;

      const result = await pdvApi.sales.emitNf(completedSale.id, {
        nfType,
        cpfConsumidor: nfType === "nfce" && cpfConsumidor ? cpfConsumidor : undefined,
        destinatario: dest
      });
      setNfResult(result.fiscal);
      setNfModal(false);
    } catch (err) {
      setNfError(err instanceof Error ? err.message : "Erro ao emitir NF");
    } finally {
      setNfLoading(false);
    }
  }

  async function openNfModal() {
    setNfType("nfce");
    setCpfConsumidor("");
    setDestinatario(emptyDestinatario);
    setNfResult(null);
    setNfError(null);
    setNfSuggestionApplied(false);
    setNfModal(true);

    if (!completedSale) return;
    try {
      const suggestion = await pdvApi.sales.comandaCustomer(completedSale.id);
      if (!suggestion) return;

      const cleanDoc = suggestion.documentNumber?.replace(/\D/g, "") ?? "";
      const isCpf = cleanDoc.length === 11;
      const isCnpj = cleanDoc.length === 14;

      if (isCpf) {
        setCpfConsumidor(cleanDoc);
      }
      setDestinatario((prev) => ({
        ...prev,
        razaoSocial: suggestion.name || prev.razaoSocial,
        cpf: isCpf ? cleanDoc : prev.cpf,
        cnpj: isCnpj ? cleanDoc : prev.cnpj,
        logradouro: suggestion.address?.street ?? prev.logradouro,
        numero: suggestion.address?.number ?? prev.numero,
        bairro: suggestion.address?.neighborhood ?? prev.bairro,
        municipio: suggestion.address?.city ?? prev.municipio,
        uf: suggestion.address?.state ?? prev.uf,
        cep: suggestion.address?.zip ?? prev.cep,
        codigoMunicipio: suggestion.address?.ibgeCode ?? prev.codigoMunicipio
      }));
      setNfSuggestionApplied(true);
    } catch {
      // sugestao e so conveniencia — falha nao impede a emissao manual
    }
  }

  if (cashierLoading) {
    return (
      <div className="page-content d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Barra de status */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-3">
          <h5 className="mb-0">Frente de Caixa</h5>
          {activeCashier ? (
            <Badge color="success" className="px-3 py-2">
              <i className="ri-checkbox-circle-line me-1" />
              Caixa Aberto · {fmt(activeCashier.openingBalance)}
            </Badge>
          ) : (
            <Badge color="secondary" className="px-3 py-2">
              <i className="ri-close-circle-line me-1" />
              Caixa Fechado
            </Badge>
          )}
          {sale && (
            <span className="text-muted small">
              Venda <code className="text-primary">#{sale.saleNumber}</code>
            </span>
          )}
          {completedSale && !sale && (
            <Badge color="info" className="px-3 py-2">
              <i className="ri-check-double-line me-1" />
              Venda #{completedSale.saleNumber} concluída
            </Badge>
          )}
        </div>
        <div className="d-flex gap-2">
          {!activeCashier && (
            <Button color="primary" size="sm" onClick={() => setOpenCashierModal(true)} disabled={actionLoading}>
              <i className="ri-add-line me-1" />
              Abrir Caixa
            </Button>
          )}
          {activeCashier && (
            <>
              <Button color="danger" outline size="sm" onClick={() => openCashMovement("sangria")} disabled={actionLoading}>
                <i className="ri-arrow-up-circle-line me-1" />
                Sangria
              </Button>
              <Button color="success" outline size="sm" onClick={() => openCashMovement("suprimento")} disabled={actionLoading}>
                <i className="ri-arrow-down-circle-line me-1" />
                Suprimento
              </Button>
              <Button color="warning" outline size="sm" onClick={openCloseCashierModal} disabled={actionLoading}>
                <i className="ri-lock-line me-1" />
                Fechar Caixa
              </Button>
            </>
          )}
        </div>
      </div>

      {cashierError && <Alert color="danger" className="mb-3">{cashierError}</Alert>}

      {!activeCashier ? (
        <Card>
          <CardBody className="text-center py-5">
            <i className="ri-store-3-line display-4 text-muted mb-3 d-block" />
            <h5 className="text-muted">Nenhum caixa aberto</h5>
            <p className="text-muted mb-4">Abra o caixa para iniciar as vendas do turno.</p>
            <Button color="primary" size="lg" onClick={() => setOpenCashierModal(true)}>
              <i className="ri-lock-unlock-line me-1" />
              Abrir Caixa
            </Button>
          </CardBody>
        </Card>
      ) : (
        <Row className="g-3">
          {/* Catálogo / Buscar Venda */}
          <Col lg={8}>
            <Card style={{ minHeight: 560 }}>
              <CardHeader className="pb-2">
                <Nav tabs className="mb-2 border-bottom-0">
                  <NavItem>
                    <NavLink
                      className={`py-1 px-3 ${catalogTab === "catalogo" ? "active" : ""}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => setCatalogTab("catalogo")}
                    >
                      <i className="ri-apps-2-line me-1" />
                      Catálogo
                    </NavLink>
                  </NavItem>
                  <NavItem>
                    <NavLink
                      className={`py-1 px-3 ${catalogTab === "buscar_venda" ? "active" : ""}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => setCatalogTab("buscar_venda")}
                    >
                      <i className="ri-file-search-line me-1" />
                      Buscar Venda
                    </NavLink>
                  </NavItem>
                </Nav>
                {catalogTab === "catalogo" && (
                  <>
                    <InputGroup>
                      <span className="input-group-text bg-white border-end-0">
                        <i className="ri-search-line text-muted" />
                      </span>
                      <Input
                        className="border-start-0"
                        placeholder="Buscar por nome, código de barras ou SKU..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => void handleSearchEnter(e)}
                      />
                      {search && (
                        <Button color="light" onClick={() => setSearch("")}>
                          <i className="ri-close-line" />
                        </Button>
                      )}
                    </InputGroup>
                    {categories.length > 0 && (
                      <div className="mt-2 d-flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          color={selectedCategory === null ? "primary" : "light"}
                          onClick={() => setSelectedCategory(null)}
                        >
                          Todos
                        </Button>
                        {categories.map((cat) => (
                          <Button
                            key={cat.id}
                            size="sm"
                            color={selectedCategory === cat.id ? "primary" : "light"}
                            onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                          >
                            {cat.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardHeader>
              <CardBody>
                {catalogTab === "catalogo" ? (
                  productsLoading ? (
                    <div className="text-center py-5"><Spinner color="primary" /></div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <i className="ri-shopping-bag-3-line display-4 d-block mb-2" />
                      {search ? "Nenhum produto encontrado." : "Nenhum produto ativo cadastrado."}
                    </div>
                  ) : (
                    <Row className="g-2">
                      {filteredProducts.map((product) => (
                        <Col key={product.id} xs={6} sm={4} md={3}>
                          <div
                            className={`border rounded p-2 h-100 d-flex flex-column ${completedSale ? "opacity-50" : ""}`}
                            style={{ cursor: completedSale ? "default" : "pointer" }}
                            onClick={() => !completedSale && void addToCart(product)}
                            role="button"
                          >
                            <div className="flex-grow-1">
                              <p className="mb-1 fw-medium small lh-sm">{product.name}</p>
                              {product.sku && (
                                <p className="mb-0 text-muted" style={{ fontSize: "0.7rem" }}>{product.sku}</p>
                              )}
                            </div>
                            <p className="mb-0 mt-2 fw-bold text-primary small">{fmt(product.salePrice)}</p>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  )
                ) : (
                  /* Buscar Venda */
                  openSalesLoading ? (
                    <div className="text-center py-5"><Spinner color="primary" /></div>
                  ) : openSales.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <i className="ri-file-list-3-line display-4 d-block mb-2" />
                      Nenhuma venda em aberto.
                    </div>
                  ) : (
                    <Table hover responsive size="sm">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Data</th>
                          <th className="text-end">Total</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {openSales.map((s) => (
                          <tr key={s.id}>
                            <td><code className="text-primary">#{s.saleNumber}</code></td>
                            <td className="text-muted small">
                              {new Date(s.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                            </td>
                            <td className="text-end fw-medium">{fmt(s.total)}</td>
                            <td>
                              <Button
                                size="sm"
                                color="primary"
                                outline
                                disabled={actionLoading}
                                onClick={() => void loadOpenSaleToCart(s.id)}
                              >
                                Retomar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )
                )}
              </CardBody>
            </Card>
          </Col>

          {/* Carrinho / Venda Concluída */}
          <Col lg={4}>
            <Card style={{ position: "sticky", top: 80 }}>
              {completedSale ? (
                /* --- Painel de venda concluída --- */
                <>
                  <CardHeader>
                    <h6 className="mb-0 text-success">
                      <i className="ri-check-double-line me-2" />
                      Venda #{completedSale.saleNumber} Concluída
                    </h6>
                  </CardHeader>
                  <CardBody>
                    {saleError && (
                      <Alert color="danger" className="py-2 small">{saleError}</Alert>
                    )}
                    <div className="p-3 bg-light rounded mb-3">
                      <div className="d-flex justify-content-between mb-1 small">
                        <span className="text-muted">Total</span>
                        <span className="fw-bold text-success">{fmt(completedSale.total)}</span>
                      </div>
                      <div className="d-flex justify-content-between mb-1 small">
                        <span className="text-muted">Data</span>
                        <span>{new Date(completedSale.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                      {completedSale.status === "cancelled" && (
                        <Badge color="danger" className="mt-2">Estornada</Badge>
                      )}
                    </div>

                    <div className="border rounded p-3 mb-3 d-none d-print-block">
                      <h6 className="mb-2">Recibo Venda #{completedSale.saleNumber}</h6>
                      <p className="small mb-2">
                        {new Date(completedSale.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                      {completedSaleItems.map((item) => (
                        <div key={item.id} className="d-flex justify-content-between small">
                          <span>{Number(item.quantity)}x {item.productName}</span>
                          <span>{fmt(item.total)}</span>
                        </div>
                      ))}
                      <div className="border-top mt-2 pt-2 d-flex justify-content-between fw-bold">
                        <span>Total</span>
                        <span>{fmt(completedSale.total)}</span>
                      </div>
                      {completedSalePayments.map((payment) => (
                        <div key={payment.id} className="d-flex justify-content-between small">
                          <span>{PAYMENT_LABELS[payment.paymentMethod]}</span>
                          <span>{fmt(payment.amount)}</span>
                        </div>
                      ))}
                    </div>

                    {nfResult && (
                      <Alert color={nfResult.status === "authorized" ? "success" : nfResult.status === "contingency" ? "warning" : "danger"} className="small mb-3">
                        {nfResult.status === "authorized" && (
                          <>
                            <i className="ri-checkbox-circle-line me-1" />
                            NF autorizada
                            {nfResult.chaveAcesso && (
                              <div className="mt-1 text-break" style={{ fontSize: "0.65rem", wordBreak: "break-all" }}>
                                Chave: {nfResult.chaveAcesso}
                              </div>
                            )}
                            {nfResult.protocolo && (
                              <div style={{ fontSize: "0.65rem" }}>Protocolo: {nfResult.protocolo}</div>
                            )}
                          </>
                        )}
                        {nfResult.status === "contingency" && (
                          <>
                            <i className="ri-time-line me-1" />
                            NF em contingência — aguardando retorno da SEFAZ.
                          </>
                        )}
                        {nfResult.status === "failed" && (
                          <>
                            <i className="ri-close-circle-line me-1" />
                            Falha na emissão: {nfResult.errorMessage ?? "Erro desconhecido"}
                          </>
                        )}
                      </Alert>
                    )}

                    <div className="d-flex flex-column gap-2">
                      <Button color="secondary" outline onClick={printReceipt} block>
                        <i className="ri-printer-line me-1" />
                        Imprimir Recibo
                      </Button>
                      {!nfResult || nfResult.status === "failed" ? (
                        <Button color="info" onClick={() => void openNfModal()} block disabled={completedSale.status === "cancelled"}>
                          <i className="ri-file-paper-2-line me-1" />
                          Emitir NF
                        </Button>
                      ) : null}
                      <Button
                        color="danger"
                        outline
                        onClick={() => setCancelCompletedModal(true)}
                        disabled={actionLoading || completedSale.status === "cancelled"}
                        block
                      >
                        <i className="ri-refund-2-line me-1" />
                        Estornar Venda
                      </Button>
                      <Button color="primary" onClick={startNewSale} block>
                        <i className="ri-add-circle-line me-1" />
                        Nova Venda
                      </Button>
                    </div>
                  </CardBody>
                </>
              ) : (
                /* --- Carrinho normal --- */
                <>
                  <CardHeader>
                    <h6 className="mb-0">
                      <i className="ri-shopping-cart-2-line me-2" />
                      Carrinho
                      {saleItems.length > 0 && <Badge color="primary" className="ms-2">{saleItems.length}</Badge>}
                    </h6>
                  </CardHeader>
                  <CardBody className="p-0">
                    {saleError && (
                      <Alert color="danger" className="m-2 mb-0 py-2 small">{saleError}</Alert>
                    )}

                    {/* Itens */}
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                      {saleItems.length === 0 ? (
                        <div className="text-center py-4 text-muted small">
                          <i className="ri-shopping-cart-line d-block mb-1" />
                          Nenhum item
                        </div>
                      ) : (
                        <Table size="sm" className="mb-0 align-middle">
                          <tbody>
                            {saleItems.map((item) => (
                              <tr key={item.id}>
                                <td className="ps-3 pe-1">
                                  <div className="fw-medium small lh-sm">{item.productName}</div>
                                  <div className="text-muted" style={{ fontSize: "0.7rem" }}>{fmt(item.unitPrice)}</div>
                                </td>
                                <td style={{ width: 76 }}>
                                  <div className="d-flex align-items-center gap-1">
                                    <Button
                                      size="sm"
                                      color="light"
                                      className="p-0 d-flex align-items-center justify-content-center"
                                      style={{ width: 20, height: 20 }}
                                      onClick={() => void updateItemQty(item.id, Number(item.quantity) - 1)}
                                      disabled={actionLoading}
                                    >
                                      <i className="ri-subtract-line" style={{ fontSize: "0.6rem" }} />
                                    </Button>
                                    <span className="small fw-medium" style={{ minWidth: 18, textAlign: "center" }}>
                                      {Number(item.quantity)}
                                    </span>
                                    <Button
                                      size="sm"
                                      color="light"
                                      className="p-0 d-flex align-items-center justify-content-center"
                                      style={{ width: 20, height: 20 }}
                                      onClick={() => void updateItemQty(item.id, Number(item.quantity) + 1)}
                                      disabled={actionLoading}
                                    >
                                      <i className="ri-add-line" style={{ fontSize: "0.6rem" }} />
                                    </Button>
                                  </div>
                                </td>
                                <td className="text-end fw-bold small">{fmt(item.total)}</td>
                                <td className="pe-2" style={{ width: 26 }}>
                                  <Button
                                    size="sm"
                                    color="light"
                                    className="p-0 d-flex align-items-center justify-content-center"
                                    style={{ width: 22, height: 22 }}
                                    onClick={() => void removeFromCart(item.id)}
                                    disabled={actionLoading}
                                  >
                                    <i className="ri-delete-bin-6-line" style={{ fontSize: "0.65rem" }} />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      )}
                    </div>

                    {/* Totais */}
                    <div className="border-top border-bottom px-3 py-2 bg-light">
                      <div className="d-flex justify-content-between small">
                        <span className="text-muted">Subtotal</span>
                        <span>{fmt(saleSubtotal)}</span>
                      </div>
                      {saleDiscount > 0 && (
                        <div className="d-flex justify-content-between small text-success">
                          <span>Desconto</span>
                          <span>-{fmt(saleDiscount)}</span>
                        </div>
                      )}
                      {paidTotal > 0 && (
                        <div className="d-flex justify-content-between small">
                          <span className="text-muted">Pago</span>
                          <span className="text-success">{fmt(paidTotal)}</span>
                        </div>
                      )}
                      {change > 0 && (
                        <div className="d-flex justify-content-between small fw-bold text-warning">
                          <span>Troco</span>
                          <span>{fmt(change)}</span>
                        </div>
                      )}
                      <div className="d-flex justify-content-between fw-bold mt-1">
                        <span>{remaining > 0 ? "Restante" : "Total"}</span>
                        <span className={remaining > 0 ? "text-danger" : "text-success"}>
                          {fmt(remaining > 0 ? remaining : saleTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Pagamentos registrados */}
                    {salePayments.length > 0 && (
                      <div className="px-3 py-2 border-bottom">
                        <p className="text-muted mb-1 text-uppercase fw-bold" style={{ fontSize: "0.65rem" }}>
                          Pagamentos
                        </p>
                        {salePayments.map((p) => (
                          <div key={p.id} className="d-flex justify-content-between small">
                            <span>{PAYMENT_LABELS[p.paymentMethod] ?? p.paymentMethod}</span>
                            <span>{fmt(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Desconto */}
                    {saleItems.length > 0 && (
                      <div className="px-3 pt-2 border-bottom pb-2">
                        <Button
                          color="warning"
                          size="sm"
                          block
                          onClick={() => { setDiscountModal(true); setDiscountError(null); setDiscountInput(""); }}
                          disabled={actionLoading}
                        >
                          <i className="ri-percent-line me-1" />
                          {saleDiscount > 0 ? `Desconto: ${fmt(saleDiscount)}` : "Aplicar Desconto"}
                        </Button>
                      </div>
                    )}

                    {/* Registrar pagamento */}
                    {saleItems.length > 0 && (
                      <div className="px-3 py-2 border-bottom">
                        <p className="text-muted mb-2 text-uppercase fw-bold" style={{ fontSize: "0.65rem" }}>
                          Registrar Pagamento
                        </p>
                        <Input
                          type="select"
                          bsSize="sm"
                          className="mb-2"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        >
                          {(Object.entries(PAYMENT_LABELS) as [PaymentMethod, string][]).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </Input>
                        <div className="d-flex gap-1">
                          <div className="flex-grow-1">
                            <CurrencyInput
                              value={paymentAmount}
                              onChange={setPaymentAmount}
                              onKeyDown={(e) => { if (e.key === "Enter" && paymentAmount) void addPayment(); }}
                              size="sm"
                              placeholder={remaining > 0 ? Number(remaining).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"}
                            />
                          </div>
                          <Button color="primary" size="sm" onClick={() => void addPayment()} disabled={actionLoading || !paymentAmount}>
                            <i className="ri-add-line" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Ações */}
                    <div className="px-3 py-3 d-flex flex-column gap-2">
                      <Button
                        color="success"
                        disabled={actionLoading || !canFinish}
                        onClick={() => void completeSale()}
                        block
                      >
                        {actionLoading
                          ? <Spinner size="sm" className="me-1" />
                          : <i className="ri-check-double-line me-1" />}
                        Finalizar Venda
                      </Button>
                      {sale && (
                        <Button color="danger" outline disabled={actionLoading} onClick={() => void cancelSale()} block>
                          <i className="ri-close-circle-line me-1" />
                          Cancelar Venda
                        </Button>
                      )}
                    </div>
                  </CardBody>
                </>
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* Modal — abrir caixa */}
      <Modal isOpen={openCashierModal} toggle={() => setOpenCashierModal(false)} centered size="sm">
        <ModalHeader toggle={() => setOpenCashierModal(false)}>Abrir Caixa</ModalHeader>
        <ModalBody>
          {cashierError && <Alert color="danger" className="py-2 small">{cashierError}</Alert>}
          <label className="form-label">Saldo de abertura</label>
          <CurrencyInput value={openingBalance} onChange={setOpeningBalance} />
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setOpenCashierModal(false)}>Cancelar</Button>
          <Button color="primary" onClick={() => void handleOpenCashier()} disabled={actionLoading}>
            {actionLoading ? <Spinner size="sm" className="me-1" /> : null}
            Abrir
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal — aplicar desconto */}
      <Modal isOpen={discountModal} toggle={() => setDiscountModal(false)} centered size="sm">
        <ModalHeader toggle={() => setDiscountModal(false)}>Aplicar Desconto</ModalHeader>
        <ModalBody>
          {discountError && <Alert color="danger" className="py-2 small">{discountError}</Alert>}
          <div className="mb-3">
            <label className="form-label">Tipo de desconto</label>
            <div className="d-flex gap-2">
              <Button
                size="sm"
                color={discountType === "value" ? "primary" : "light"}
                onClick={() => { setDiscountType("value"); setDiscountInput(""); }}
              >
                R$ Valor
              </Button>
              <Button
                size="sm"
                color={discountType === "percent" ? "primary" : "light"}
                onClick={() => { setDiscountType("percent"); setDiscountInput(""); }}
              >
                % Percentual
              </Button>
            </div>
          </div>
          <label className="form-label">
            {discountType === "value" ? "Valor do desconto" : "Percentual de desconto"}
          </label>
          {discountType === "value" ? (
            <CurrencyInput value={discountInput} onChange={setDiscountInput} />
          ) : (
            <InputGroup>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder="0,00"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
              />
              <InputGroupText>%</InputGroupText>
            </InputGroup>
          )}
          {saleSubtotal > 0 && (
            <p className="text-muted small mt-2 mb-0">
              Subtotal: {fmt(saleSubtotal)}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setDiscountModal(false)}>Cancelar</Button>
          <Button color="primary" onClick={() => void handleApplyDiscount()} disabled={actionLoading || !discountInput}>
            {actionLoading ? <Spinner size="sm" className="me-1" /> : null}
            Aplicar
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal — fechar caixa com resumo */}
      <Modal isOpen={closeCashierModal} toggle={() => setCloseCashierModal(false)} centered>
        <ModalHeader toggle={() => setCloseCashierModal(false)}>Fechar Caixa</ModalHeader>
        <ModalBody>
          {summaryLoading ? (
            <div className="text-center py-3"><Spinner color="primary" /></div>
          ) : cashierSummary ? (
            <>
              <div className="mb-3 p-3 bg-light rounded">
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-muted small">Saldo de abertura</span>
                  <span className="small fw-medium">{fmt(cashierSummary.openingBalance)}</span>
                </div>
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-muted small">Vendas finalizadas</span>
                  <span className="small fw-medium">{cashierSummary.salesCount}</span>
                </div>
                <div className="d-flex justify-content-between fw-bold border-top pt-2 mt-2">
                  <span>Total arrecadado</span>
                  <span className="text-success">{fmt(cashierSummary.totalCollected)}</span>
                </div>
                <div className="d-flex justify-content-between mb-1 mt-2">
                  <span className="text-muted small">Sangria/Suprimento</span>
                  <span className={Number(cashierSummary.movementTotal) < 0 ? "text-danger small fw-medium" : "text-success small fw-medium"}>
                    {fmt(cashierSummary.movementTotal)}
                  </span>
                </div>
                <div className="d-flex justify-content-between fw-bold border-top pt-2 mt-2">
                  <span>Saldo esperado</span>
                  <span>{fmt(cashierSummary.expectedClosingBalance)}</span>
                </div>
              </div>
              {cashierSummary.byMethod.length > 0 && (
                <div>
                  <p className="text-muted text-uppercase fw-bold mb-2" style={{ fontSize: "0.7rem" }}>
                    Por forma de pagamento
                  </p>
                  {cashierSummary.byMethod.map((m) => (
                    <div key={m.paymentMethod} className="d-flex justify-content-between small mb-1">
                      <span>{PAYMENT_LABELS[m.paymentMethod as PaymentMethod] ?? m.paymentMethod}</span>
                      <span className="fw-medium">{fmt(m.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {cashierSummary.movements.length > 0 && (
                <div className="mt-3">
                  <p className="text-muted text-uppercase fw-bold mb-2" style={{ fontSize: "0.7rem" }}>
                    Movimentações
                  </p>
                  {cashierSummary.movements.slice(0, 5).map((movement) => (
                    <div key={movement.id} className="d-flex justify-content-between small mb-1">
                      <span>
                        {movement.type === "sangria" ? "Sangria" : "Suprimento"} · {movement.reason}
                      </span>
                      <span className={movement.type === "sangria" ? "text-danger fw-medium" : "text-success fw-medium"}>
                        {movement.type === "sangria" ? "-" : "+"}{fmt(movement.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <label className="form-label">Valor contado no caixa</label>
                <CurrencyInput value={countedBalance} onChange={setCountedBalance} />
                {countedBalance && (
                  <div className="d-flex justify-content-between small mt-2">
                    <span className="text-muted">Diferença</span>
                    <span className={closingDifference === 0 ? "fw-medium" : closingDifference > 0 ? "text-success fw-medium" : "text-danger fw-medium"}>
                      {fmt(closingDifference)}
                    </span>
                  </div>
                )}
              </div>
              <Alert color="warning" className="mt-3 py-2 small mb-0">
                <i className="ri-alert-line me-1" />
                Vendas em aberto vinculadas a este caixa serão canceladas.
              </Alert>
            </>
          ) : (
            <p className="text-muted">Não foi possível carregar o resumo do caixa.</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setCloseCashierModal(false)}>Cancelar</Button>
          <Button color="warning" onClick={() => void confirmCloseCashier()} disabled={actionLoading || summaryLoading || !countedBalance}>
            {actionLoading ? <Spinner size="sm" className="me-1" /> : <i className="ri-lock-line me-1" />}
            Confirmar Fechamento
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal — sangria/suprimento */}
      <Modal isOpen={cashMovementModal} toggle={() => setCashMovementModal(false)} centered size="sm">
        <ModalHeader toggle={() => setCashMovementModal(false)}>
          {cashMovementType === "sangria" ? "Registrar Sangria" : "Registrar Suprimento"}
        </ModalHeader>
        <ModalBody>
          {cashierError && <Alert color="danger" className="py-2 small">{cashierError}</Alert>}
          <div className="mb-3">
            <label className="form-label">Tipo</label>
            <div className="d-flex gap-2">
              <Button
                size="sm"
                color={cashMovementType === "sangria" ? "danger" : "light"}
                onClick={() => setCashMovementType("sangria")}
              >
                Sangria
              </Button>
              <Button
                size="sm"
                color={cashMovementType === "suprimento" ? "success" : "light"}
                onClick={() => setCashMovementType("suprimento")}
              >
                Suprimento
              </Button>
            </div>
          </div>
          <label className="form-label">Valor</label>
          <CurrencyInput value={cashMovementAmount} onChange={setCashMovementAmount} />
          <label className="form-label mt-3">Motivo</label>
          <Input
            value={cashMovementReason}
            onChange={(event) => setCashMovementReason(event.target.value)}
            placeholder="Ex.: retirada para cofre"
          />
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setCashMovementModal(false)}>Cancelar</Button>
          <Button
            color={cashMovementType === "sangria" ? "danger" : "success"}
            onClick={() => void confirmCashMovement()}
            disabled={actionLoading || !cashMovementAmount || cashMovementReason.trim().length < 3}
          >
            {actionLoading ? <Spinner size="sm" className="me-1" /> : null}
            Registrar
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal — estornar venda concluída */}
      <Modal isOpen={cancelCompletedModal} toggle={() => setCancelCompletedModal(false)} centered>
        <ModalHeader toggle={() => setCancelCompletedModal(false)}>Estornar Venda</ModalHeader>
        <ModalBody>
          <Alert color="warning" className="py-2 small">
            <i className="ri-alert-line me-1" />
            O estorno repõe o estoque baixado pela venda original.
          </Alert>
          <label className="form-label">Motivo do estorno</label>
          <Input
            type="textarea"
            rows={3}
            value={cancelCompletedReason}
            onChange={(event) => setCancelCompletedReason(event.target.value)}
            placeholder="Descreva o motivo operacional"
          />
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setCancelCompletedModal(false)}>Cancelar</Button>
          <Button
            color="danger"
            onClick={() => void confirmCancelCompletedSale()}
            disabled={actionLoading || cancelCompletedReason.trim().length < 3}
          >
            {actionLoading ? <Spinner size="sm" className="me-1" /> : <i className="ri-refund-2-line me-1" />}
            Confirmar Estorno
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal — emitir NF */}
      <Modal isOpen={nfModal} toggle={() => setNfModal(false)} centered size="lg">
        <ModalHeader toggle={() => setNfModal(false)}>Emitir Nota Fiscal</ModalHeader>
        <ModalBody>
          {nfError && <Alert color="danger" className="py-2 small">{nfError}</Alert>}
          {nfSuggestionApplied && (
            <Alert color="info" className="py-2 small">
              Dados sugeridos a partir da comanda de origem. Confira e edite antes de emitir.
            </Alert>
          )}

          <div className="mb-3">
            <label className="form-label fw-medium">Tipo de documento</label>
            <div className="d-flex gap-2">
              <Button
                color={nfType === "nfce" ? "primary" : "light"}
                onClick={() => setNfType("nfce")}
              >
                <i className="ri-receipt-line me-1" />
                NFC-e
                <small className="d-block" style={{ fontSize: "0.65rem", fontWeight: 400 }}>Consumidor final</small>
              </Button>
              <Button
                color={nfType === "nfe" ? "primary" : "light"}
                onClick={() => setNfType("nfe")}
              >
                <i className="ri-file-paper-2-line me-1" />
                NF-e
                <small className="d-block" style={{ fontSize: "0.65rem", fontWeight: 400 }}>Pessoa jurídica / física</small>
              </Button>
            </div>
          </div>

          {nfType === "nfce" && (
            <div className="mb-3">
              <label className="form-label">CPF do consumidor <span className="text-muted">(opcional)</span></label>
              <Input
                placeholder="000.000.000-00"
                value={cpfConsumidor}
                onChange={(e) => setCpfConsumidor(e.target.value.replace(/\D/g, "").slice(0, 11))}
                maxLength={14}
              />
            </div>
          )}

          {nfType === "nfe" && (
            <div className="border rounded p-3">
              <p className="text-muted text-uppercase fw-bold mb-3" style={{ fontSize: "0.7rem" }}>
                Destinatário
              </p>
              <Row className="g-2">
                <Col xs={12}>
                  <label className="form-label form-label-sm">Razão Social <span className="text-danger">*</span></label>
                  <Input
                    bsSize="sm"
                    value={destinatario.razaoSocial}
                    onChange={(e) => setDestinatario((d) => ({ ...d, razaoSocial: e.target.value }))}
                    placeholder="Nome ou razão social"
                  />
                </Col>
                <Col xs={6}>
                  <label className="form-label form-label-sm">CNPJ</label>
                  <Input
                    bsSize="sm"
                    value={destinatario.cnpj}
                    onChange={(e) => setDestinatario((d) => ({ ...d, cnpj: e.target.value.replace(/\D/g, "").slice(0, 14) }))}
                    placeholder="00000000000000"
                  />
                </Col>
                <Col xs={6}>
                  <label className="form-label form-label-sm">CPF</label>
                  <Input
                    bsSize="sm"
                    value={destinatario.cpf}
                    onChange={(e) => setDestinatario((d) => ({ ...d, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                    placeholder="00000000000"
                  />
                </Col>
                <Col xs={8}>
                  <label className="form-label form-label-sm">Logradouro</label>
                  <Input
                    bsSize="sm"
                    value={destinatario.logradouro}
                    onChange={(e) => setDestinatario((d) => ({ ...d, logradouro: e.target.value }))}
                  />
                </Col>
                <Col xs={4}>
                  <label className="form-label form-label-sm">Número</label>
                  <Input
                    bsSize="sm"
                    value={destinatario.numero}
                    onChange={(e) => setDestinatario((d) => ({ ...d, numero: e.target.value }))}
                  />
                </Col>
                <Col xs={6}>
                  <label className="form-label form-label-sm">Bairro</label>
                  <Input
                    bsSize="sm"
                    value={destinatario.bairro}
                    onChange={(e) => setDestinatario((d) => ({ ...d, bairro: e.target.value }))}
                  />
                </Col>
                <Col xs={6}>
                  <label className="form-label form-label-sm">Município</label>
                  <Input
                    bsSize="sm"
                    value={destinatario.municipio}
                    onChange={(e) => setDestinatario((d) => ({ ...d, municipio: e.target.value }))}
                  />
                </Col>
                <Col xs={3}>
                  <label className="form-label form-label-sm">UF</label>
                  <Input
                    bsSize="sm"
                    value={destinatario.uf}
                    maxLength={2}
                    onChange={(e) => setDestinatario((d) => ({ ...d, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                  />
                </Col>
                <Col xs={4}>
                  <label className="form-label form-label-sm">CEP</label>
                  <Input
                    bsSize="sm"
                    value={destinatario.cep}
                    onChange={(e) => setDestinatario((d) => ({ ...d, cep: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
                    placeholder="00000000"
                  />
                </Col>
                <Col xs={5}>
                  <label className="form-label form-label-sm">Cód. IBGE Município</label>
                  <Input
                    bsSize="sm"
                    value={destinatario.codigoMunicipio}
                    onChange={(e) => setDestinatario((d) => ({ ...d, codigoMunicipio: e.target.value.replace(/\D/g, "").slice(0, 7) }))}
                    placeholder="0000000"
                  />
                </Col>
              </Row>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setNfModal(false)} disabled={nfLoading}>Cancelar</Button>
          <Button
            color="info"
            onClick={() => void handleEmitNf()}
            disabled={nfLoading || (nfType === "nfe" && !destinatario.razaoSocial)}
          >
            {nfLoading ? <Spinner size="sm" className="me-1" /> : <i className="ri-file-paper-2-line me-1" />}
            Emitir {nfType === "nfce" ? "NFC-e" : "NF-e"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={pixModal} toggle={() => pixStatus !== "creating" && setPixModal(false)} centered>
        <ModalHeader toggle={() => pixStatus !== "creating" && setPixModal(false)}>
          Pagamento PIX
        </ModalHeader>
        <ModalBody>
          {pixError && <Alert color="danger">{pixError}</Alert>}
          {pixStatus === "creating" && (
            <div className="text-center py-4">
              <Spinner color="primary" />
              <p className="text-muted mt-3 mb-0">Criando cobrança segura…</p>
            </div>
          )}
          {pixStatus !== "creating" && pixStatus !== "received" && (
            <div className="text-center py-3">
              <i className="ri-qr-code-line text-primary" style={{ fontSize: "3rem" }} />
              <h5 className="mt-2">Aguardando pagamento</h5>
              <p className="text-muted">
                Abra o Checkout InfinitePay para exibir o QR Code. Esta tela confirmará automaticamente após a validação.
              </p>
              {pixCheckoutUrl && (
                <Button color="primary" tag="a" href={pixCheckoutUrl} target="_blank" rel="noopener noreferrer">
                  <i className="ri-external-link-line me-1" />
                  Abrir Checkout PIX
                </Button>
              )}
              <div className="mt-3">
                <Spinner size="sm" className="me-2" />
                <span className="text-muted small">Verificando pagamento…</span>
              </div>
            </div>
          )}
          {pixStatus === "received" && (
            <div className="text-center py-4">
              <i className="ri-checkbox-circle-fill text-success" style={{ fontSize: "3rem" }} />
              <h5 className="mt-2">PIX confirmado</h5>
              <p className="text-muted mb-0">O pagamento foi validado diretamente com a InfinitePay.</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color={pixStatus === "received" ? "success" : "light"} onClick={() => setPixModal(false)}>
            {pixStatus === "received" ? "Continuar" : "Fechar"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
