"use client";

import React, { FormEvent, useEffect, useState } from "react";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader,
  Col, Form, FormGroup, Input, Label, Row, Spinner, Table
} from "reactstrap";
import { pdvApi, PdvStockLocation, PdvStockTransfer, PageResult } from "@/modules/pdv/lib/pdv-api";
import { CatalogProduct, catalogApi } from "@/modules/pdv/lib/catalog-api";

export default function TransferenciasPage() {
  const [stores, setStores] = useState<PdvStockLocation[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [transfers, setTransfers] = useState<PdvStockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [storesRes, productsRes, transfersRes] = await Promise.all([
        pdvApi.stockLocations.list(),
        catalogApi.products.list({ limit: 200, offset: 0, status: "active", visibleInPdv: true }),
        pdvApi.stockTransfers.list({ limit: 50, offset: 0 })
      ]);
      setStores(storesRes.data.filter((s) => s.status === "active"));
      setProducts(productsRes.data.filter((p) => p.trackInventory));
      setTransfers(transfersRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!fromLocationId || !toLocationId || !productId || !quantity) return;
    if (fromLocationId === toLocationId) {
      setError("Origem e destino devem ser lojas diferentes.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await pdvApi.stockTransfers.create({ fromLocationId, toLocationId, productId, quantity, notes: notes || undefined });
      setSuccess("Transferência registrada com sucesso.");
      setFromLocationId(""); setToLocationId(""); setProductId(""); setQuantity(""); setNotes("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao registrar transferência");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-content">
      <Row className="g-4">
        <Col lg={5}>
          <Card>
            <CardHeader>
              <h5 className="mb-0">Nova Transferência</h5>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}
              <Form onSubmit={submit}>
                <FormGroup>
                  <Label>Produto <span className="text-danger">*</span></Label>
                  <Input type="select" value={productId} required onChange={(e) => setProductId(e.target.value)}>
                    <option value="">Selecione o produto</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>
                    ))}
                  </Input>
                </FormGroup>
                <FormGroup>
                  <Label>Quantidade <span className="text-danger">*</span></Label>
                  <Input
                    type="number" min="0.001" step="0.001" required
                    value={quantity} onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0.000"
                  />
                </FormGroup>
                <FormGroup>
                  <Label>Origem <span className="text-danger">*</span></Label>
                  <Input type="select" value={fromLocationId} required onChange={(e) => setFromLocationId(e.target.value)}>
                    <option value="">Selecione a loja de origem</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.isMatriz ? " (Matriz)" : ""}</option>
                    ))}
                  </Input>
                </FormGroup>
                <FormGroup>
                  <Label>Destino <span className="text-danger">*</span></Label>
                  <Input type="select" value={toLocationId} required onChange={(e) => setToLocationId(e.target.value)}>
                    <option value="">Selecione a loja de destino</option>
                    {stores.filter((s) => s.id !== fromLocationId).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.isMatriz ? " (Matriz)" : ""}</option>
                    ))}
                  </Input>
                </FormGroup>
                <FormGroup>
                  <Label>Observação</Label>
                  <Input type="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </FormGroup>
                <Button color="primary" type="submit" disabled={saving} className="w-100">
                  {saving ? <><Spinner size="sm" className="me-1" />Registrando...</> : "Registrar Transferência"}
                </Button>
              </Form>
            </CardBody>
          </Card>
        </Col>

        <Col lg={7}>
          <Card>
            <CardHeader>
              <h5 className="mb-0">Histórico de Transferências</h5>
            </CardHeader>
            <CardBody>
              {loading ? (
                <div className="text-center py-4"><Spinner color="primary" /></div>
              ) : transfers.length === 0 ? (
                <p className="text-muted text-center py-4 mb-0">Nenhuma transferência registrada.</p>
              ) : (
                <div className="table-responsive">
                  <Table className="table-nowrap mb-0" hover>
                    <thead className="table-light">
                      <tr>
                        <th>Produto</th>
                        <th>Qtd</th>
                        <th>Origem</th>
                        <th>Destino</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map((t) => (
                        <tr key={t.id}>
                          <td>{t.productName}</td>
                          <td><Badge color="secondary">{t.quantity}</Badge></td>
                          <td>{t.fromLocationName}</td>
                          <td>{t.toLocationName}</td>
                          <td className="text-muted small">
                            {new Date(t.transferredAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
