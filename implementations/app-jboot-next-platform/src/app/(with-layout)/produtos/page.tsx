"use client";

import React, { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Col, Form, FormGroup, Input, Label, Row, Spinner, Table } from "reactstrap";
import { PdvAdminPage } from "@/modules/pdv/components/PdvAdminPage";
import { PdvPayload, PdvStockLocation, PdvInventoryBalance, PdvStockTransfer, pdvApi } from "@/modules/pdv/lib/pdv-api";
import { CatalogProduct, CatalogPayload, ProductInitialStock, catalogApi } from "@/modules/pdv/lib/catalog-api";

// ─── Step 3: Estoque ──────────────────────────────────────────────────────────

interface ProductEstoqueStepProps {
  editingId?: string;
  stores: PdvStockLocation[];
  storesError: string | null;
  form: PdvPayload;
  setForm: React.Dispatch<React.SetStateAction<PdvPayload>>;
}

function ProductEstoqueStep({ editingId, stores, storesError, form, setForm }: ProductEstoqueStepProps) {
  const [balances, setBalances] = useState<PdvInventoryBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTotals, setNewTotals] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);

  async function loadBalances() {
    if (!editingId) { setBalances([]); return; }
    setLoading(true);
    pdvApi.inventoryBalances
      .list({ productId: editingId, limit: 100, offset: 0 })
      .then((r) => setBalances(r.data))
      .catch(() => setBalances([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { void loadBalances(); }, [editingId]);

  function currentQty(locationId: string): number {
    return Number(balances.find((b) => b.locationId === locationId)?.quantity ?? 0);
  }

  function delta(locationId: string): number | null {
    const raw = newTotals[locationId];
    if (raw === undefined || raw === "") return null;
    return Number(raw) - currentQty(locationId);
  }

  async function applyAdjustments() {
    if (!editingId) return;
    const entries = stores
      .map((s) => ({ store: s, d: delta(s.id) }))
      .filter((e) => e.d !== null && e.d !== 0);
    if (entries.length === 0) return;

    setApplying(true);
    setApplyError(null);
    setApplySuccess(false);
    try {
      await Promise.all(
        entries.map(({ store, d }) =>
          pdvApi.inventoryAdjustments.create({
            productId: editingId,
            locationId: store.id,
            type: d! > 0 ? "adjustment_in" : "adjustment_out",
            quantity: String(Math.abs(d!))
          })
        )
      );
      setNewTotals({});
      setApplySuccess(true);
      await loadBalances();
      setTimeout(() => setApplySuccess(false), 3000);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Erro ao aplicar ajuste");
    } finally {
      setApplying(false);
    }
  }

  // ── Modo edição ──
  if (editingId) {
    const hasChanges = stores.some((s) => delta(s.id) !== null && delta(s.id) !== 0);

    return (
      <div className="mt-3">
        <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-3">Estoque por Loja</p>
        {loading ? (
          <div className="text-center py-2"><Spinner size="sm" color="primary" /></div>
        ) : (
          <>
            <Row className="g-2 mb-1">
              <Col xs={4} className="text-muted small fw-semibold">Loja</Col>
              <Col xs={2} className="text-muted small fw-semibold text-end">Atual</Col>
              <Col xs={3} className="text-muted small fw-semibold">Novo total</Col>
              <Col xs={3} className="text-muted small fw-semibold">Ajuste</Col>
            </Row>
            {stores.map((store) => {
              const atual = currentQty(store.id);
              const d = delta(store.id);
              return (
                <Row key={store.id} className="g-2 align-items-center mb-2">
                  <Col xs={4} className="small">
                    {store.name}
                    {store.isMatriz && <Badge color="primary" className="ms-1 fw-normal" style={{ fontSize: "0.6rem" }}>M</Badge>}
                  </Col>
                  <Col xs={2} className="text-end">
                    <span className="small fw-semibold">{atual}</span>
                  </Col>
                  <Col xs={3}>
                    <Input
                      type="number"
                      bsSize="sm"
                      min="0"
                      step="0.001"
                      placeholder={String(atual)}
                      value={newTotals[store.id] ?? ""}
                      onChange={(e) => setNewTotals((prev) => ({ ...prev, [store.id]: e.target.value }))}
                    />
                  </Col>
                  <Col xs={3}>
                    {d === null || d === 0 ? (
                      <span className="text-muted small">—</span>
                    ) : (
                      <Badge color={d > 0 ? "success" : "warning"} className="fw-semibold" style={{ fontSize: "0.75rem" }}>
                        {d > 0 ? `+${d}` : d}
                      </Badge>
                    )}
                  </Col>
                </Row>
              );
            })}
            {applyError && <Alert color="danger" className="py-2 small mt-2 mb-0">{applyError}</Alert>}
            {applySuccess && <Alert color="success" className="py-2 small mt-2 mb-0">Estoque atualizado com sucesso.</Alert>}
            {hasChanges && (
              <Button color="primary" size="sm" className="mt-3" disabled={applying} onClick={() => void applyAdjustments()}>
                {applying ? <><Spinner size="sm" className="me-1" />Aplicando...</> : "Aplicar ajuste"}
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Modo criação ──
  if (storesError) {
    return <Alert color="warning" className="mt-3 mb-0 py-2 small">{storesError}</Alert>;
  }

  return (
    <div className="mt-3">
      <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">Estoque Inicial por Loja</p>
      {stores.length === 0 ? (
        <p className="text-muted small mb-0">Nenhuma loja ativa. Cadastre lojas em <strong>Lojas</strong>.</p>
      ) : !form.trackInventory ? (
        <div className="rounded border border-dashed p-3 text-center text-muted small">
          Ative <strong>Controla estoque</strong> acima para definir o saldo inicial de cada loja.
        </div>
      ) : (
        <Row className="g-3">
          {stores.map((store) => (
            <Col md={6} key={store.id}>
              <FormGroup className="mb-0">
                <Label className="small">
                  {store.name}
                  {store.isMatriz && <Badge color="primary" className="ms-2 fw-normal" style={{ fontSize: "0.65rem" }}>Matriz</Badge>}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="0"
                  value={String(form[`_stock_${store.id}`] ?? "")}
                  onChange={(e) => setForm((prev) => ({ ...prev, [`_stock_${store.id}`]: e.target.value }))}
                />
              </FormGroup>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

// ─── Step 4: Transferências ───────────────────────────────────────────────────

interface ProductTransferenciasStepProps {
  editingId?: string;
  stores: PdvStockLocation[];
}

function ProductTransferenciasStep({ editingId, stores }: ProductTransferenciasStepProps) {
  const [transfers, setTransfers] = useState<PdvStockTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  async function loadTransfers() {
    if (!editingId) return;
    setLoading(true);
    pdvApi.stockTransfers
      .list({ productId: editingId, limit: 50, offset: 0 })
      .then((r) => setTransfers(r.data))
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { void loadTransfers(); }, [editingId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editingId || !fromLocationId || !toLocationId || !quantity) return;
    if (fromLocationId === toLocationId) {
      setError("Origem e destino devem ser lojas diferentes.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await pdvApi.stockTransfers.create({
        fromLocationId, toLocationId,
        productId: editingId,
        quantity,
        notes: notes || undefined
      });
      setFromLocationId(""); setToLocationId(""); setQuantity(""); setNotes("");
      await loadTransfers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar transferência");
    } finally {
      setSaving(false);
    }
  }

  if (!editingId) {
    return (
      <Alert color="info" className="mt-3 mb-0 py-2 small">
        Salve o produto primeiro para registrar transferências de estoque.
      </Alert>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-3">Nova Transferência</p>
      <Form onSubmit={(e) => { void submit(e); }}>
        <Row className="g-2">
          <Col md={6}>
            <FormGroup className="mb-2">
              <Label className="small">Origem <span className="text-danger">*</span></Label>
              <Input type="select" value={fromLocationId} required onChange={(e) => setFromLocationId(e.target.value)}>
                <option value="">Selecione</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isMatriz ? " (Matriz)" : ""}</option>)}
              </Input>
            </FormGroup>
          </Col>
          <Col md={6}>
            <FormGroup className="mb-2">
              <Label className="small">Destino <span className="text-danger">*</span></Label>
              <Input type="select" value={toLocationId} required onChange={(e) => setToLocationId(e.target.value)}>
                <option value="">Selecione</option>
                {stores.filter((s) => s.id !== fromLocationId).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.isMatriz ? " (Matriz)" : ""}</option>
                ))}
              </Input>
            </FormGroup>
          </Col>
          <Col md={4}>
            <FormGroup className="mb-2">
              <Label className="small">Quantidade <span className="text-danger">*</span></Label>
              <Input type="number" min="0.001" step="0.001" required placeholder="0.000"
                value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </FormGroup>
          </Col>
          <Col md={8}>
            <FormGroup className="mb-2">
              <Label className="small">Observação</Label>
              <Input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormGroup>
          </Col>
        </Row>
        {error && <Alert color="danger" className="py-2 small mb-2">{error}</Alert>}
        <Button color="primary" size="sm" type="submit" disabled={saving || stores.length < 2}>
          {saving ? <><Spinner size="sm" className="me-1" />Registrando...</> : "Registrar Transferência"}
        </Button>
      </Form>

      <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2 mt-4">Histórico</p>
      {loading ? (
        <div className="text-center py-2"><Spinner size="sm" color="primary" /></div>
      ) : transfers.length === 0 ? (
        <p className="text-muted small mb-0">Nenhuma transferência registrada para este produto.</p>
      ) : (
        <Table size="sm" className="mb-0 table-nowrap">
          <thead className="table-light">
            <tr><th>Origem</th><th>Destino</th><th>Qtd</th><th>Data</th></tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id}>
                <td>{t.fromLocationName}</td>
                <td>{t.toLocationName}</td>
                <td>{t.quantity}</td>
                <td className="text-muted small">
                  {new Date(t.transferredAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

interface ProductImageStepProps {
  editingId?: string;
  imageUrl?: string | null;
  onUploaded: (product: CatalogProduct) => void;
}

function ProductImageStep({ editingId, imageUrl, onUploaded }: ProductImageStepProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setPreviewUrl(imageUrl ?? null);
  }, [imageUrl]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!editingId || !file) return;
    setUploading(true);
    setError(null);
    setSuccess(false);
    try {
      const product = await catalogApi.products.uploadImage(editingId, file);
      setPreviewUrl(product.imageUrl);
      onUploaded(product);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar imagem");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  if (!editingId) {
    return (
      <Alert color="info" className="mt-3 mb-0 py-2 small">
        Salve o produto primeiro para enviar a imagem do cardápio.
      </Alert>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-3">Imagem do Cardápio</p>
      <Row className="g-3 align-items-center">
        <Col md={4}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Imagem atual do produto"
              className="rounded border object-fit-cover"
              style={{ width: "100%", aspectRatio: "4 / 3" }}
            />
          ) : (
            <div className="rounded border bg-light d-flex align-items-center justify-content-center text-muted small" style={{ aspectRatio: "4 / 3" }}>
              Sem imagem
            </div>
          )}
        </Col>
        <Col md={8}>
          <FormGroup className="mb-2">
            <Label className="small">Arquivo</Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={(event) => { void handleFileChange(event); }}
            />
          </FormGroup>
          <p className="text-muted small mb-2">PNG, JPG ou WebP ate 5 MB.</p>
          {uploading && <div className="small text-muted"><Spinner size="sm" className="me-1" />Enviando...</div>}
          {error && <Alert color="danger" className="py-2 small mb-0">{error}</Alert>}
          {success && <Alert color="success" className="py-2 small mb-0">Imagem atualizada.</Alert>}
        </Col>
      </Row>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [categoryOptions, setCategoryOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [stores, setStores] = useState<PdvStockLocation[]>([]);
  const [storesError, setStoresError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    catalogApi.categories
      .list({ limit: 200, offset: 0, status: "active" })
      .then((r) => { if (active) setCategoryOptions(r.data.map((c) => ({ label: c.name, value: c.id }))); })
      .catch(() => { if (active) setCategoryOptions([]); });

    pdvApi.stockLocations
      .list()
      .then((r) => { if (active) setStores(r.data.filter((s) => s.status === "active")); })
      .catch(() => { if (active) setStoresError("Não foi possível carregar lojas."); });

    return () => { active = false; };
  }, []);

  function extractInitialStock(form: PdvPayload): ProductInitialStock[] {
    return stores
      .map((s) => ({ locationId: s.id, quantity: String(form[`_stock_${s.id}`] ?? "") }))
      .filter((e) => e.quantity !== "" && Number(e.quantity) > 0);
  }

  const createProduct = useCallback(async (payload: CatalogPayload): Promise<CatalogProduct> => {
    const initialStock = extractInitialStock(payload as PdvPayload);
    const clean: CatalogPayload = Object.fromEntries(
      Object.entries(payload).filter(([k]) => !k.startsWith("_stock_"))
    );
    return catalogApi.products.create(clean, initialStock.length > 0 ? initialStock : undefined);
  }, [stores]);

  const renderStepExtra = useCallback((
    step: number,
    form: PdvPayload,
    setForm: React.Dispatch<React.SetStateAction<PdvPayload>>,
    isEditing: boolean,
    editingId?: string,
    editing?: CatalogProduct | null,
    onExternalUpdate?: (row: CatalogProduct) => void
  ) => {
    void form;
    void setForm;
    if (step === 1) {
      return (
        <ProductImageStep
          editingId={isEditing ? editingId : undefined}
          imageUrl={editing?.imageUrl ?? null}
          onUploaded={(product) => onExternalUpdate?.(product)}
        />
      );
    }
    if (step === 3) {
      return (
        <ProductEstoqueStep
          editingId={isEditing ? editingId : undefined}
          stores={stores}
          storesError={storesError}
          form={form}
          setForm={setForm}
        />
      );
    }
    if (step === 4) {
      return (
        <ProductTransferenciasStep
          editingId={isEditing ? editingId : undefined}
          stores={stores}
        />
      );
    }
    return null;
  }, [stores, storesError]);

  return (
    <PdvAdminPage<CatalogProduct>
      title="Produtos"
      subtitle="Catálogo compartilhado de produtos — reutilizável em PDV, Cardápio Digital e Comanda."
      columns={[
        { key: "name", label: "Produto" },
        { key: "imageUrl", label: "Imagem", render: (row) => row.imageUrl ? "✓" : "—" },
        { key: "sku", label: "SKU" },
        { key: "barcode", label: "Cód. Barras" },
        { key: "salePrice", label: "Preço" },
        { key: "visibleInPdv", label: "PDV", render: (row) => row.visibleInPdv ? "✓" : "—" },
        { key: "visibleInCardapio", label: "Cardápio", render: (row) => row.visibleInCardapio ? "✓" : "—" },
        { key: "visibleInComanda", label: "Comanda", render: (row) => row.visibleInComanda ? "✓" : "—" },
        { key: "queueType", label: "Fila", render: (row) => row.queueType === "cozinha" ? "Cozinha" : row.queueType === "bar" ? "Bar" : "—" },
        { key: "status", label: "Status" }
      ]}
      fields={[
        { name: "name", label: "Nome", section: "Identificação", required: true },
        {
          name: "categoryId",
          label: "Categoria",
          section: "Identificação",
          type: "select",
          placeholder: "Sem categoria",
          options: categoryOptions
        },
        { name: "sku", label: "SKU", section: "Identificação" },
        { name: "barcode", label: "Código de barras", section: "Identificação" },
        { name: "ncm", label: "NCM", section: "Dados fiscais", placeholder: "73181500" },
        { name: "cfop", label: "CFOP", section: "Dados fiscais", placeholder: "5102" },
        { name: "cest", label: "CEST", section: "Dados fiscais", placeholder: "Quando aplicável" },
        { name: "gtin", label: "GTIN/EAN", section: "Dados fiscais", placeholder: "Vazio = SEM GTIN" },
        { name: "description", label: "Descrição", section: "Detalhes", colMd: 12 },
        { name: "unit", label: "Unidade", section: "Comercial", required: true },
        { name: "salePrice", label: "Preço venda", section: "Comercial", type: "currency", required: true },
        { name: "costPrice", label: "Preço custo", section: "Comercial", type: "currency" },
        { name: "visibleInPdv", label: "Visível no PDV", section: "Visibilidade", type: "checkbox", step: 2 },
        { name: "visibleInCardapio", label: "Visível no Cardápio Digital", section: "Visibilidade", type: "checkbox", step: 2 },
        { name: "visibleInComanda", label: "Visível na Comanda", section: "Visibilidade", type: "checkbox", step: 2 },
        {
          name: "queueType",
          label: "Fila de preparo",
          section: "Comanda",
          type: "select",
          placeholder: "Sem fila",
          options: [
            { label: "Cozinha", value: "cozinha" },
            { label: "Bar", value: "bar" }
          ],
          step: 2
        },
        { name: "trackInventory", label: "Controla estoque", section: "Controle", type: "checkbox", step: 3 }
      ]}
      steps={[
        { label: "Dados", icon: "ri-file-text-line" },
        { label: "Visibilidade", icon: "ri-eye-line" },
        { label: "Estoque", icon: "ri-archive-line" },
        { label: "Transferências", icon: "ri-arrow-left-right-line" }
      ]}
      renderStepExtra={renderStepExtra}
      load={(params) => catalogApi.products.list(params)}
      create={createProduct}
      update={catalogApi.products.update}
      remove={catalogApi.products.remove}
    />
  );
}
