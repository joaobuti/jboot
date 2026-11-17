"use client";

import React, { useCallback, useEffect, useState } from "react";
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
  Nav,
  NavItem,
  NavLink,
  Row,
  Spinner,
  TabContent,
  TabPane
} from "reactstrap";
import { fiscalConfigApi, FiscalConfig, UpsertFiscalConfigPayload } from "@/lib/fiscal-config-api";

type TabId = "emitente" | "documentos" | "tributacao" | "certificado";

interface FormState {
  cnpjEmitente: string;
  razaoSocial: string;
  nomeFantasia: string;
  inscricaoEstadual: string;
  telefone: string;
  email: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  codigoMunicipio: string;
  ambiente: "homologacao" | "producao";
  serieNfce: string;
  serieNfe: string;
  csc: string;
  cscId: string;
  regimeFiscal: string;
  cfopPadraoNfce: string;
  cfopPadraoNfe: string;
  icmsOrigemPadrao: string;
  icmsCstPadrao: string;
  icmsAliquotaPadrao: string;
  pisCstPadrao: string;
  pisAliquotaPadrao: string;
  cofinsCstPadrao: string;
  cofinsAliquotaPadrao: string;
}

const EMPTY_FORM: FormState = {
  cnpjEmitente: "",
  razaoSocial: "",
  nomeFantasia: "",
  inscricaoEstadual: "",
  telefone: "",
  email: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  uf: "",
  cep: "",
  codigoMunicipio: "",
  ambiente: "homologacao",
  serieNfce: "1",
  serieNfe: "1",
  csc: "",
  cscId: "",
  regimeFiscal: "simples",
  cfopPadraoNfce: "",
  cfopPadraoNfe: "",
  icmsOrigemPadrao: "0",
  icmsCstPadrao: "",
  icmsAliquotaPadrao: "",
  pisCstPadrao: "",
  pisAliquotaPadrao: "",
  cofinsCstPadrao: "",
  cofinsAliquotaPadrao: ""
};

const TAB_ITEMS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "emitente", label: "Emitente", icon: "ri-building-4-line" },
  { id: "documentos", label: "Documentos", icon: "ri-file-list-3-line" },
  { id: "tributacao", label: "Tributação", icon: "ri-percent-line" },
  { id: "certificado", label: "Certificado", icon: "ri-shield-keyhole-line" }
];

function configToForm(c: FiscalConfig): FormState {
  return {
    cnpjEmitente: c.cnpjEmitente,
    razaoSocial: c.razaoSocial,
    nomeFantasia: c.nomeFantasia ?? "",
    inscricaoEstadual: c.inscricaoEstadual,
    telefone: c.telefone ?? "",
    email: c.email ?? "",
    logradouro: c.logradouro,
    numero: c.numero,
    complemento: c.complemento ?? "",
    bairro: c.bairro,
    municipio: c.municipio,
    uf: c.uf,
    cep: c.cep,
    codigoMunicipio: c.codigoMunicipio,
    ambiente: c.ambiente,
    serieNfce: String(c.serieNfce),
    serieNfe: String(c.serieNfe),
    csc: "",
    cscId: c.cscId ?? "",
    regimeFiscal: c.regimeFiscal,
    cfopPadraoNfce: c.cfopPadraoNfce ?? "",
    cfopPadraoNfe: c.cfopPadraoNfe ?? "",
    icmsOrigemPadrao: c.icmsOrigemPadrao === null ? "0" : String(c.icmsOrigemPadrao),
    icmsCstPadrao: c.icmsCstPadrao ?? "",
    icmsAliquotaPadrao: c.icmsAliquotaPadrao === null ? "" : String(c.icmsAliquotaPadrao),
    pisCstPadrao: c.pisCstPadrao ?? "",
    pisAliquotaPadrao: c.pisAliquotaPadrao === null ? "" : String(c.pisAliquotaPadrao),
    cofinsCstPadrao: c.cofinsCstPadrao ?? "",
    cofinsAliquotaPadrao: c.cofinsAliquotaPadrao === null ? "" : String(c.cofinsAliquotaPadrao)
  };
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  return Number(value.replace(",", "."));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",").pop() ?? "" : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler certificado."));
    reader.readAsDataURL(file);
  });
}

export function ModuleFiscalConfig() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loadedConfig, setLoadedConfig] = useState<FiscalConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("emitente");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const configs = await fiscalConfigApi.list();
      const primary = configs[0] ?? null;
      setLoadedConfig(primary);
      setForm(primary ? configToForm(primary) : EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar configuração fiscal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const cnpj = form.cnpjEmitente.replace(/\D/g, "");
    if (cnpj.length !== 14) {
      setError("Informe um CNPJ válido com 14 dígitos.");
      setActiveTab("emitente");
      return;
    }

    const requiredIssuerFields: Array<[string, string]> = [
      [form.razaoSocial, "razão social"],
      [form.inscricaoEstadual, "inscrição estadual"],
      [form.logradouro, "logradouro"],
      [form.numero, "número"],
      [form.bairro, "bairro"],
      [form.municipio, "município"],
      [form.uf, "UF"],
      [form.cep, "CEP"],
      [form.codigoMunicipio, "código IBGE do município"]
    ];
    const missing = requiredIssuerFields.find(([value]) => value.trim() === "");
    if (missing) {
      setError(`Informe ${missing[1]} do emitente.`);
      setActiveTab("emitente");
      return;
    }
    if (form.uf.trim().length !== 2 || form.cep.replace(/\D/g, "").length !== 8 || form.codigoMunicipio.replace(/\D/g, "").length !== 7) {
      setError("Confira UF (2 letras), CEP (8 dígitos) e código IBGE (7 dígitos).");
      setActiveTab("emitente");
      return;
    }
    if (!loadedConfig?.cscConfigured && !form.csc.trim()) {
      setError("Informe o CSC para a primeira configuração de NFC-e.");
      setActiveTab("documentos");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: UpsertFiscalConfigPayload = {
        cnpjEmitente: cnpj,
        razaoSocial: form.razaoSocial.trim(),
        nomeFantasia: form.nomeFantasia.trim() || undefined,
        inscricaoEstadual: form.inscricaoEstadual.replace(/\D/g, ""),
        telefone: form.telefone.replace(/\D/g, "") || undefined,
        email: form.email.trim() || undefined,
        logradouro: form.logradouro.trim(),
        numero: form.numero.trim(),
        complemento: form.complemento.trim() || undefined,
        bairro: form.bairro.trim(),
        municipio: form.municipio.trim(),
        uf: form.uf.trim().toUpperCase(),
        cep: form.cep.replace(/\D/g, ""),
        codigoMunicipio: form.codigoMunicipio.replace(/\D/g, ""),
        ambiente: form.ambiente,
        serieNfce: Number(form.serieNfce) || 1,
        serieNfe: Number(form.serieNfe) || 1,
        regimeFiscal: form.regimeFiscal,
        csc: form.csc.trim() || undefined,
        cscId: form.cscId,
        cfopPadraoNfce: form.cfopPadraoNfce,
        cfopPadraoNfe: form.cfopPadraoNfe,
        icmsOrigemPadrao: optionalNumber(form.icmsOrigemPadrao),
        icmsCstPadrao: form.icmsCstPadrao,
        icmsAliquotaPadrao: optionalNumber(form.icmsAliquotaPadrao),
        pisCstPadrao: form.pisCstPadrao,
        pisAliquotaPadrao: optionalNumber(form.pisAliquotaPadrao),
        cofinsCstPadrao: form.cofinsCstPadrao,
        cofinsAliquotaPadrao: optionalNumber(form.cofinsAliquotaPadrao)
      };
      const saved = await fiscalConfigApi.upsert(payload);
      setLoadedConfig(saved);
      setForm(configToForm(saved));
      setSuccess("Configuração fiscal salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configuração fiscal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCertificateUpload() {
    const cnpj = form.cnpjEmitente.replace(/\D/g, "");
    if (!certificateFile || !certificatePassword || cnpj.length !== 14) {
      setError("Informe CNPJ, arquivo PFX e senha do certificado.");
      setActiveTab("certificado");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const pfxBase64 = await fileToBase64(certificateFile);
      await fiscalConfigApi.uploadCertificate({
        cnpjEmitente: cnpj,
        ambiente: form.ambiente,
        pfxBase64,
        pfxPassword: certificatePassword
      });
      setCertificateFile(null);
      setCertificatePassword("");
      setSuccess("Certificado digital enviado e validado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar certificado digital.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner color="primary" />
      </div>
    );
  }

  return (
    <Row>
      <Col xs={12}>
        <Card>
          <CardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div>
              <h5 className="mb-1">Configuração Fiscal</h5>
              <div className="d-flex align-items-center gap-2 text-muted">
                <span>{form.cnpjEmitente || "CNPJ não configurado"}</span>
                <Badge color={form.ambiente === "homologacao" ? "warning" : "success"}>
                  {form.ambiente === "homologacao" ? "Homologação" : "Produção"}
                </Badge>
              </div>
            </div>
            <Button color="primary" onClick={handleSave} disabled={saving}>
              {saving ? <><Spinner size="sm" className="me-1" />Salvando</> : "Salvar"}
            </Button>
          </CardHeader>
          <CardBody>
            {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
            {success && <Alert color="success" toggle={() => setSuccess(null)}>{success}</Alert>}

            <Row className="g-4">
              <Col xs={12} lg={2}>
                <Nav pills className="flex-lg-column gap-2">
                  {TAB_ITEMS.map((item) => (
                    <NavItem key={item.id}>
                      <NavLink
                        href="#"
                        className={`d-flex align-items-center ${activeTab === item.id ? "active" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveTab(item.id);
                        }}
                      >
                        <i className={`${item.icon} me-2`} />
                        {item.label}
                      </NavLink>
                    </NavItem>
                  ))}
                </Nav>
              </Col>
              <Col xs={12} lg={10}>
                <Form onSubmit={handleSave}>
                  <TabContent activeTab={activeTab}>
                <TabPane tabId="emitente">
                  <Row>
                    <Col md={7}>
                      <FormGroup>
                        <Label>CNPJ Emitente</Label>
                        <Input
                          value={form.cnpjEmitente}
                          onChange={(e) => set("cnpjEmitente", e.target.value)}
                          disabled={Boolean(loadedConfig)}
                          maxLength={14}
                          placeholder="Somente números"
                        />
                      </FormGroup>
                    </Col>
                    <Col md={5}>
                      <FormGroup>
                        <Label>Ambiente</Label>
                        <Input type="select" value={form.ambiente} onChange={(e) => set("ambiente", e.target.value)}>
                          <option value="homologacao">Homologação</option>
                          <option value="producao">Produção</option>
                        </Input>
                      </FormGroup>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={8}><FormGroup><Label>Razão Social</Label><Input required value={form.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} /></FormGroup></Col>
                    <Col md={4}><FormGroup><Label>Inscrição Estadual</Label><Input required value={form.inscricaoEstadual} onChange={(e) => set("inscricaoEstadual", e.target.value)} /></FormGroup></Col>
                    <Col md={6}><FormGroup><Label>Nome Fantasia</Label><Input value={form.nomeFantasia} onChange={(e) => set("nomeFantasia", e.target.value)} /></FormGroup></Col>
                    <Col md={3}><FormGroup><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} /></FormGroup></Col>
                    <Col md={3}><FormGroup><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></FormGroup></Col>
                  </Row>
                  <Row>
                    <Col md={7}><FormGroup><Label>Logradouro</Label><Input required value={form.logradouro} onChange={(e) => set("logradouro", e.target.value)} /></FormGroup></Col>
                    <Col md={2}><FormGroup><Label>Número</Label><Input required value={form.numero} onChange={(e) => set("numero", e.target.value)} /></FormGroup></Col>
                    <Col md={3}><FormGroup><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => set("complemento", e.target.value)} /></FormGroup></Col>
                    <Col md={4}><FormGroup><Label>Bairro</Label><Input required value={form.bairro} onChange={(e) => set("bairro", e.target.value)} /></FormGroup></Col>
                    <Col md={4}><FormGroup><Label>Município</Label><Input required value={form.municipio} onChange={(e) => set("municipio", e.target.value)} /></FormGroup></Col>
                    <Col md={2}><FormGroup><Label>UF</Label><Input required maxLength={2} value={form.uf} onChange={(e) => set("uf", e.target.value)} /></FormGroup></Col>
                    <Col md={2}><FormGroup><Label>CEP</Label><Input required maxLength={8} value={form.cep} onChange={(e) => set("cep", e.target.value)} /></FormGroup></Col>
                    <Col md={4}><FormGroup><Label>Código IBGE</Label><Input required maxLength={7} value={form.codigoMunicipio} onChange={(e) => set("codigoMunicipio", e.target.value)} /></FormGroup></Col>
                  </Row>
                  <Row>
                    <Col md={6}>
                      <FormGroup>
                        <Label>Regime Fiscal</Label>
                        <Input type="select" value={form.regimeFiscal} onChange={(e) => set("regimeFiscal", e.target.value)}>
                          <option value="simples">Simples Nacional</option>
                          <option value="lucro_presumido">Lucro Presumido</option>
                          <option value="lucro_real">Lucro Real</option>
                        </Input>
                      </FormGroup>
                    </Col>
                  </Row>
                </TabPane>

                <TabPane tabId="documentos">
                  <Row>
                    <Col md={3}>
                      <FormGroup>
                        <Label>Série NFC-e</Label>
                        <Input type="number" min={1} value={form.serieNfce} onChange={(e) => set("serieNfce", e.target.value)} />
                      </FormGroup>
                    </Col>
                    <Col md={3}>
                      <FormGroup>
                        <Label>Série NF-e</Label>
                        <Input type="number" min={1} value={form.serieNfe} onChange={(e) => set("serieNfe", e.target.value)} />
                      </FormGroup>
                    </Col>
                    <Col md={3}>
                      <FormGroup>
                        <Label>CFOP NFC-e</Label>
                        <Input value={form.cfopPadraoNfce} onChange={(e) => set("cfopPadraoNfce", e.target.value)} maxLength={4} placeholder="5102" />
                      </FormGroup>
                    </Col>
                    <Col md={3}>
                      <FormGroup>
                        <Label>CFOP NF-e</Label>
                        <Input value={form.cfopPadraoNfe} onChange={(e) => set("cfopPadraoNfe", e.target.value)} maxLength={4} placeholder="5102" />
                      </FormGroup>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={8}>
                      <FormGroup>
                        <Label>CSC</Label>
                        <Input type="password" value={form.csc} onChange={(e) => set("csc", e.target.value)} placeholder={loadedConfig?.cscConfigured ? "Configurado — preencha somente para trocar" : "Código de Segurança do Contribuinte"} />
                      </FormGroup>
                    </Col>
                    <Col md={4}>
                      <FormGroup>
                        <Label>CSC ID</Label>
                        <Input value={form.cscId} onChange={(e) => set("cscId", e.target.value)} placeholder="000001" />
                      </FormGroup>
                    </Col>
                  </Row>
                </TabPane>

                    <TabPane tabId="tributacao">
                      <Row className="g-3">
                        <Col xl={4} md={6}>
                          <div className="border rounded p-3 h-100">
                            <h6 className="mb-3">ICMS</h6>
                            <Row>
                              <Col md={6} xl={12} xxl={6}>
                                <FormGroup>
                                  <Label>Origem</Label>
                                  <Input type="select" value={form.icmsOrigemPadrao} onChange={(e) => set("icmsOrigemPadrao", e.target.value)}>
                                    <option value="0">0 - Nacional</option>
                                    <option value="1">1 - Estrangeira importação direta</option>
                                    <option value="2">2 - Estrangeira mercado interno</option>
                                    <option value="3">3 - Nacional importação &gt; 40%</option>
                                    <option value="4">4 - Nacional PPB</option>
                                    <option value="5">5 - Nacional importação ≤ 40%</option>
                                    <option value="6">6 - Estrangeira sem similar</option>
                                    <option value="7">7 - Estrangeira mercado interno sem similar</option>
                                    <option value="8">8 - Nacional importação &gt; 70%</option>
                                  </Input>
                                </FormGroup>
                              </Col>
                              <Col md={6} xl={12} xxl={6}>
                                <FormGroup>
                                  <Label>CSOSN/CST</Label>
                                  <Input value={form.icmsCstPadrao} onChange={(e) => set("icmsCstPadrao", e.target.value)} placeholder="Ex: 400, 102, 00" />
                                </FormGroup>
                              </Col>
                              <Col md={6} xl={12} xxl={6}>
                                <FormGroup className="mb-0">
                                  <Label>Alíquota ICMS %</Label>
                                  <Input type="number" step="0.0001" min={0} value={form.icmsAliquotaPadrao} onChange={(e) => set("icmsAliquotaPadrao", e.target.value)} placeholder="Ex: 18" />
                                </FormGroup>
                              </Col>
                            </Row>
                          </div>
                        </Col>
                        <Col xl={4} md={6}>
                          <div className="border rounded p-3 h-100">
                            <h6 className="mb-3">PIS</h6>
                            <Row>
                              <Col md={6} xl={12} xxl={6}>
                                <FormGroup>
                                  <Label>CST PIS</Label>
                                  <Input value={form.pisCstPadrao} onChange={(e) => set("pisCstPadrao", e.target.value)} placeholder="Ex: 01, 07, 49" />
                                </FormGroup>
                              </Col>
                              <Col md={6} xl={12} xxl={6}>
                                <FormGroup className="mb-0">
                                  <Label>Alíquota PIS %</Label>
                                  <Input type="number" step="0.0001" min={0} value={form.pisAliquotaPadrao} onChange={(e) => set("pisAliquotaPadrao", e.target.value)} placeholder="Ex: 1.65" />
                                </FormGroup>
                              </Col>
                            </Row>
                          </div>
                        </Col>
                        <Col xl={4} md={6}>
                          <div className="border rounded p-3 h-100">
                            <h6 className="mb-3">COFINS</h6>
                            <Row>
                              <Col md={6} xl={12} xxl={6}>
                                <FormGroup>
                                  <Label>CST COFINS</Label>
                                  <Input value={form.cofinsCstPadrao} onChange={(e) => set("cofinsCstPadrao", e.target.value)} placeholder="Ex: 01, 07, 49" />
                                </FormGroup>
                              </Col>
                              <Col md={6} xl={12} xxl={6}>
                                <FormGroup className="mb-0">
                                  <Label>Alíquota COFINS %</Label>
                                  <Input type="number" step="0.0001" min={0} value={form.cofinsAliquotaPadrao} onChange={(e) => set("cofinsAliquotaPadrao", e.target.value)} placeholder="Ex: 7.6" />
                                </FormGroup>
                              </Col>
                            </Row>
                          </div>
                        </Col>
                      </Row>
                      <Alert color="info" className="mt-3 mb-0">
                        NCM, CEST, base de cálculo e valores de imposto continuam por produto/item fiscal. IPI ainda não é emitido pelos builders NF-e/NFC-e atuais.
                      </Alert>
                    </TabPane>

                <TabPane tabId="certificado">
                  <Row>
                    <Col md={7}>
                      <FormGroup>
                        <Label>Certificado A1 (.pfx)</Label>
                        <Input
                          type="file"
                          accept=".pfx,.p12,application/x-pkcs12"
                          onChange={(e) => setCertificateFile(e.target.files?.[0] ?? null)}
                        />
                      </FormGroup>
                    </Col>
                    <Col md={5}>
                      <FormGroup>
                        <Label>Senha do certificado</Label>
                        <Input
                          type="password"
                          value={certificatePassword}
                          onChange={(e) => setCertificatePassword(e.target.value)}
                          autoComplete="new-password"
                        />
                      </FormGroup>
                    </Col>
                  </Row>
                  <div className="d-flex justify-content-end">
                    <Button type="button" color="primary" outline onClick={handleCertificateUpload} disabled={uploading}>
                      {uploading ? <><Spinner size="sm" className="me-1" />Enviando</> : "Enviar certificado"}
                    </Button>
                  </div>
                </TabPane>
                  </TabContent>
                </Form>
              </Col>
            </Row>
          </CardBody>
        </Card>
      </Col>
    </Row>
  );
}
