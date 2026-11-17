"use client";

import OfficeKitEmailSettings from "@/modules/kanban/components/offices/OfficeKitEmailSettings";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
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
import "quill/dist/quill.snow.css";
import {
  KanbanApiError,
  kanbanApi,
  KitMarkDto,
  OfficeListItemDto,
  ServiceContractDto,
  ServiceContractVersionDto,
  ServiceContractVersionSummaryDto,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { formatBytes, TEMPLATE_ACCEPT, validateTemplateFile } from "@/modules/kanban/lib/document-templates";
import { describeKitWarning, describeServiceContractError, highlightTags } from "./service-contract";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function errorMessage(cause: unknown, fallback: string): string {
  return (cause instanceof KanbanApiError && describeServiceContractError(cause)) || describeKanbanError(cause, fallback);
}

/** Previa das versoes antigas do editor: HTML ja limpo no servidor, com as tags destacadas. */
function ContractPreview({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = html;
    highlightTags(ref.current);
  }, [html]);
  return <div ref={ref} className="ql-editor service-contract-preview p-0" style={{ minHeight: 200 }} />;
}

function MarkList({ marks, color }: { marks: KitMarkDto[]; color: "info" | "warning" }) {
  if (marks.length === 0) return <p className="text-muted small mb-0">Nenhuma.</p>;
  return (
    <div className="d-flex flex-wrap gap-1">
      {marks.map((item) => (
        <Badge key={item.mark} color={color} className={`bg-${color}-subtle text-${color}-emphasis`}>
          {item.mark}
          {item.count > 1 ? ` ×${item.count}` : ""}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Aba "Contrato Servicos" (docs/product/flow-office-service-contract-sprints.md, Sprint 3; ADR 019,
 * decisao 14): o modelo do kit e o `.docx` do escritorio. Cada envio diferente cria versao; o servidor
 * analisa tags, blocos JEC/JEF, linha-molde dos contratos e marcas de genero e plural. Versoes do
 * editor antigo (HTML) ficam so para consulta.
 */
export default function OfficeServiceContractPanel({ offices }: { offices: OfficeListItemDto[] }) {
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? "");
  const [contract, setContract] = useState<ServiceContractDto | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyVersion, setBusyVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<ServiceContractVersionDto | null>(null);

  const load = useCallback(async () => {
    if (!officeId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      setContract(await kanbanApi.offices.serviceContract(officeId));
    } catch (cause) {
      setContract(null);
      setError(describeKanbanError(cause, "Erro ao carregar o contrato do escritório"));
    } finally {
      setLoading(false);
    }
  }, [officeId]);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseFile(next: File | null) {
    setError(null);
    setNotice(null);
    const problem = next ? validateTemplateFile(next) : null;
    if (problem) {
      setError(problem);
      setFile(null);
      setFileInputKey((key) => key + 1);
      return;
    }
    setFile(next);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await kanbanApi.offices.uploadServiceContract(officeId, file);
      setContract(result);
      setNotice(result.created ? `Versão ${result.current?.version} salva.` : "O arquivo é igual ao da versão atual; nenhuma versão nova foi criada.");
      setFile(null);
      setFileInputKey((key) => key + 1);
    } catch (cause) {
      setError(errorMessage(cause, "Erro ao enviar o modelo"));
    } finally {
      setUploading(false);
    }
  }

  async function download(version: number) {
    setBusyVersion(version);
    setError(null);
    try {
      const { url } = await kanbanApi.offices.serviceContractDownload(officeId, version);
      const link = window.document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (cause) {
      setError(errorMessage(cause, "Erro ao gerar o link de download"));
    } finally {
      setBusyVersion(null);
    }
  }

  async function openHtmlVersion(version: number) {
    setBusyVersion(version);
    setError(null);
    try {
      setPreview(await kanbanApi.offices.serviceContractVersion(officeId, version));
    } catch (cause) {
      setError(describeKanbanError(cause, "Erro ao abrir a versão"));
    } finally {
      setBusyVersion(null);
    }
  }

  if (offices.length === 0) {
    return (
      <Alert color="info">
        <i className="ri-information-line me-2" />
        Cadastre um escritório na aba Escritórios para enviar o modelo do kit dele.
      </Alert>
    );
  }

  const current = contract?.current ?? null;
  const docx = current?.format === "docx" ? current : null;

  return (
    <>
      <Row className="g-3 align-items-end mb-3">
        <Col md={5}>
          <Label for="service-contract-office">Escritório</Label>
          <Input
            id="service-contract-office"
            type="select"
            value={officeId}
            onChange={(event) => setOfficeId(event.target.value)}
            disabled={uploading}
          >
            {offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
                {office.active ? "" : " (inativo)"}
              </option>
            ))}
          </Input>
        </Col>
        <Col md={7} className="text-md-end text-muted small">
          {current
            ? `Versão atual ${current.version} · ${formatDate(current.createdAt)}${current.createdByName ? ` · ${current.createdByName}` : ""}`
            : "Este escritório ainda não tem modelo."}
        </Col>
      </Row>

      {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
      {notice && <Alert color="success" toggle={() => setNotice(null)}>{notice}</Alert>}

      <Row className="g-3">
        <Col xl={8}>
          <Card className="mb-3">
            <CardHeader>
              <h5 className="mb-0">
                <i className="ri-file-word-line me-2" />
                Modelo do kit (.docx)
              </h5>
            </CardHeader>
            <CardBody>
              {loading ? (
                <div className="text-center py-2">
                  <Spinner size="sm" color="primary" />
                </div>
              ) : docx ? (
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                  <div>
                    <div className="fw-medium">{docx.fileName}</div>
                    <div className="text-muted small">
                      Versão {docx.version}
                      {docx.sizeBytes ? ` · ${formatBytes(docx.sizeBytes)}` : ""} · {docx.tags.length} tags
                    </div>
                  </div>
                  <Button color="light" onClick={() => void download(docx.version)} disabled={busyVersion !== null}>
                    {busyVersion === docx.version ? <Spinner size="sm" className="me-1" /> : <i className="ri-download-2-line me-1" />}
                    Baixar
                  </Button>
                </div>
              ) : (
                <Alert color="warning" className="small">
                  <i className="ri-error-warning-line me-1" />
                  {current
                    ? "O modelo atual é do editor antigo. Envie o .docx do kit do escritório: o kit é gerado a partir dele."
                    : "Envie o .docx do kit do escritório. O kit do cliente é gerado a partir dele."}
                </Alert>
              )}
              <FormGroup className="mb-2">
                <Label for="service-contract-file">{docx ? "Enviar nova versão" : "Arquivo do modelo"}</Label>
                <Input
                  key={fileInputKey}
                  id="service-contract-file"
                  type="file"
                  accept={TEMPLATE_ACCEPT}
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                  disabled={uploading || loading}
                />
                <div className="form-text">
                  Word (.docx), até 10 MB, sem macro e sem objeto incorporado: o mesmo kit que o escritório já usa, com os
                  campos em [[NOME_COMPLETO]]. O Flow repete a linha dos contratos (tags _1) por contrato, troca o termo de
                  renúncia para o JEF quando for o caso e tira a Declaração de Residência.
                </div>
              </FormGroup>
              <div className="d-flex justify-content-end">
                <Button color="primary" onClick={() => void upload()} disabled={!file || uploading}>
                  {uploading ? <Spinner size="sm" className="me-1" /> : <i className="ri-upload-2-line me-1" />}
                  Enviar
                </Button>
              </div>
            </CardBody>
          </Card>

          {docx && (
            <Card className="mb-0">
              <CardHeader>
                <h5 className="mb-0">
                  <i className="ri-genderless-line me-2" />
                  Marcas de gênero e plural
                </h5>
              </CardHeader>
              <CardBody>
                <p className="text-muted small">
                  Na geração do kit, o Flow resolve o gênero pelo cliente. O plural de contrato(s), empréstimo(s), parcela(s) e
                  desconto(s), e do artigo logo antes deles, segue a quantidade de contratos; as demais marcas, a de instituições.
                </p>
                <Label className="small fw-bold">Gênero</Label>
                <MarkList marks={docx.marks?.gender ?? []} color="info" />
                <Label className="small fw-bold mt-3">Plural</Label>
                <MarkList marks={docx.marks?.plural ?? []} color="info" />
                {(docx.marks?.unrecognized.length ?? 0) > 0 && (
                  <Alert color="warning" className="small mt-3 mb-0">
                    <div className="mb-2">
                      Marcas que o Flow não reconhece ficam com o texto original no kit, para o advogado corrigir:
                    </div>
                    <MarkList marks={docx.marks?.unrecognized ?? []} color="warning" />
                  </Alert>
                )}
              </CardBody>
            </Card>
          )}
        </Col>

        <Col xl={4}>
          {docx && (
            <Card className="mb-3">
              <CardHeader>
                <h5 className="mb-0">
                  <i className="ri-price-tag-3-line me-2" />
                  Tags
                </h5>
              </CardHeader>
              <CardBody>
                <p className="text-muted small">
                  Os valores das tags vêm da IA. Ao criar, renomear ou remover uma tag no Word, ajuste também o prompt da
                  rotina de validação.
                </p>
                <div className="d-flex flex-wrap gap-1">
                  {docx.tags.map((tag) => (
                    <Badge key={tag} color="warning" className="bg-warning-subtle text-warning-emphasis">
                      [[{tag}]]
                    </Badge>
                  ))}
                </div>
                <div className="small mt-3">
                  <div>
                    <span className="text-muted">Linha dos contratos: </span>
                    {docx.loanRowTags.length > 0 ? docx.loanRowTags.join(", ") : "não encontrada"}
                  </div>
                  <div>
                    <span className="text-muted">Blocos: </span>
                    {docx.blocks.length > 0 ? docx.blocks.join(", ") : "nenhum"}
                  </div>
                </div>
                {docx.invalidTags.length > 0 && (
                  <Alert color="warning" className="mt-3 mb-0 small">
                    Fora do formato (use letras maiúsculas, números e _): {docx.invalidTags.join(", ")}
                  </Alert>
                )}
                {docx.warnings.length > 0 && (
                  <Alert color="warning" className="mt-3 mb-0 small">
                    <ul className="mb-0 ps-3">
                      {docx.warnings.map((warning) => (
                        <li key={warning.code}>{describeKitWarning(warning)}</li>
                      ))}
                    </ul>
                  </Alert>
                )}
              </CardBody>
            </Card>
          )}

          <Card className="mb-0">
            <CardHeader>
              <h5 className="mb-0">
                <i className="ri-history-line me-2" />
                Versões
              </h5>
            </CardHeader>
            <CardBody className="p-0">
              {!contract || contract.versions.length === 0 ? (
                <p className="text-muted small p-3 mb-0">Nenhuma versão.</p>
              ) : (
                <div className="table-responsive" style={{ maxHeight: 320 }}>
                  <Table className="table-nowrap align-middle mb-0 small" hover>
                    <tbody>
                      {contract.versions.map((item: ServiceContractVersionSummaryDto) => (
                        <tr key={item.version}>
                          <td>
                            <div className="fw-medium">
                              Versão {item.version}
                              {item.format === "html" && <span className="text-muted fw-normal"> · editor antigo</span>}
                            </div>
                            <div className="text-muted">
                              {formatDate(item.createdAt)}
                              {item.createdByName ? ` · ${item.createdByName}` : ""}
                            </div>
                          </td>
                          <td className="text-muted">{item.tags.length} tags</td>
                          <td className="text-end">
                            <Button
                              size="sm"
                              color="light"
                              disabled={busyVersion !== null}
                              onClick={() => void (item.format === "docx" ? download(item.version) : openHtmlVersion(item.version))}
                            >
                              {busyVersion === item.version ? <Spinner size="sm" /> : item.format === "docx" ? "Baixar" : "Ver"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </CardBody>
          </Card>
          {officeId && <OfficeKitEmailSettings key={officeId} officeId={officeId} />}
        </Col>
      </Row>

      <Modal isOpen={preview !== null} toggle={() => setPreview(null)} size="xl" scrollable>
        <ModalHeader toggle={() => setPreview(null)}>Versão {preview?.version} · editor antigo</ModalHeader>
        <ModalBody>
          <style>{".service-contract-preview td { border: 1px solid var(--vz-border-color); padding: 4px 8px; }"}</style>
          {preview?.contentHtml && <ContractPreview html={preview.contentHtml} />}
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setPreview(null)}>
            Fechar
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
