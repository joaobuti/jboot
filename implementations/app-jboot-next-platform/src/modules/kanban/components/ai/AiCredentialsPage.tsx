"use client";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
  Form,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { AiCredential, AiProvider, aiGatewayApi } from "@/lib/ai-gateway-api";
export default function AiCredentialsPage() {
  const [items, setItems] = useState<AiCredential[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<AiCredential | null>(null),
    [saving, setSaving] = useState(false),
    [providers, setProviders] = useState<AiProvider[]>([]),
    [provider, setProvider] = useState(""),
    [submitError, setSubmitError] = useState(""),
    [apiKey, setApiKey] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const [credentials, catalog] = await Promise.all([
        aiGatewayApi.credentials.list(),
        aiGatewayApi.providers.list(),
      ]);
      setItems(credentials);
      const active = catalog.filter(
        (p) =>
          p.status === "active" && p.capabilities.includes("credential-test"),
      );
      setProviders(active);
      setProvider((current) =>
        active.some((p) => p.id === current) ? current : (active[0]?.id ?? ""),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const closeModal = () => {
    if (saving) return;
    setOpen(false);
    setEditing(null);
    setApiKey("");
    setSubmitError("");
  };
  const beginEdit = (credential: AiCredential) => {
    setEditing(credential);
    setProvider(credential.provider);
    setApiKey("");
    setSubmitError("");
    setOpen(true);
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSaving(true);
    try {
      await aiGatewayApi.credentials.createAndValidate(
        editing?.provider ?? provider,
        apiKey,
      );
      setOpen(false);
      setEditing(null);
      setApiKey("");
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Falha ao salvar");
      await load();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="page-content">
      <Row>
        <Col lg={12}>
          <Card>
            <CardHeader className="d-flex align-items-center justify-content-between">
              <h5 className="mb-0">Credenciais de IA</h5>
              <Button
                color="primary"
                size="sm"
                disabled={loading || !providers.length}
                onClick={() => {
                  setEditing(null);
                  setProvider(providers[0]?.id ?? "");
                  setSubmitError("");
                  setApiKey("");
                  setOpen(true);
                }}
              >
                <i className="ri-add-line align-bottom me-1" />
                Nova credencial
              </Button>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <Alert color="info">
                O vínculo com ChatGPT Plus aguarda habilitação comercial da
                OpenAI. Até a liberação, a execução pode usar uma API key
                cadastrada explicitamente; não existe fallback automático
                entre as modalidades.
              </Alert>
              {loading ? (
                <div className="text-center py-4">
                  <Spinner color="primary" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-muted text-center py-4 mb-0">
                  Nenhuma credencial cadastrada.
                </p>
              ) : (
                <div className="table-responsive">
                  <Table hover className="table-nowrap">
                    <thead className="table-light">
                      <tr>
                        <th>Provider</th>
                        <th>Final</th>
                        <th>Status</th>
                        <th className="text-end">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((x) => (
                        <tr key={x.id}>
                          <td>
                            {providers.find((p) => p.id === x.provider)
                              ?.label ?? x.provider}
                          </td>
                          <td>•••• {x.last4}</td>
                          <td>
                            <Badge
                              color={
                                x.status === "active" ? "success" : "secondary"
                              }
                            >
                              {x.status}
                            </Badge>
                          </td>
                          <td className="text-end">
                            <Button
                              size="sm"
                              color="light"
                              className="me-2"
                              disabled={
                                !providers.some((p) => p.id === x.provider)
                              }
                              onClick={() => beginEdit(x)}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              color="light"
                              onClick={async () => {
                                await aiGatewayApi.credentials.test(x.id);
                                await load();
                              }}
                            >
                              Testar
                            </Button>
                            {x.status !== "revoked" && (
                              <Button
                                size="sm"
                                color="danger"
                                outline
                                className="ms-2"
                                onClick={async () => {
                                  await aiGatewayApi.credentials.revoke(x.id);
                                  await load();
                                }}
                              >
                                Revogar
                              </Button>
                            )}
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
      <Modal size="xl" isOpen={open} toggle={closeModal} centered>
        <Form onSubmit={save}>
          <ModalHeader toggle={closeModal}>
            {editing ? "Editar credencial" : "Nova credencial"}
          </ModalHeader>
          <ModalBody>
            <Row className="g-4">
              <Col xs={12} lg={3}>
                <div className="nav flex-column nav-pills">
                  <button type="button" className="nav-link active text-start">
                    <i className="ri-plug-line align-middle me-2" />
                    Integração
                  </button>
                </div>
              </Col>
              <Col xs={12} lg={9}>
                <h5 className="mb-3">Dados da integração</h5>
                {submitError && <Alert color="danger">{submitError}</Alert>}
                <FormGroup>
                  <Label>Integração de IA *</Label>
                  <Input
                    type="select"
                    disabled={!!editing || saving}
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
                <FormGroup className="mb-0">
                  <Label>{editing ? "Nova API key *" : "API key *"}</Label>
                  <Input
                    type="password"
                    disabled={saving}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="new-password"
                    placeholder={
                      editing
                        ? "Informe a chave corrigida ou substituta"
                        : "Informe a chave de API do provedor"
                    }
                  />
                  <small className="text-muted">
                    {editing &&
                      `Chave atual: •••• ${editing.last4}. Informe a nova chave completa para substituí-la. `}
                    A chave é validada ao salvar, cifrada no banco e nunca volta
                    a ser exibida.
                  </small>
                </FormGroup>
              </Col>
            </Row>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              color="light"
              disabled={saving}
              onClick={closeModal}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              color="primary"
              disabled={saving || !provider || apiKey.length < 8}
            >
              {saving && <Spinner size="sm" className="me-2" />}Salvar
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
    </div>
  );
}
