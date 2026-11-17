"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, FormGroup, Input, Label, Spinner, Table } from "reactstrap";
import {
  CustomerDocumentProfileDto,
  CustomerDocumentReviewDto,
  CustomerDocumentType,
  CustomerDocumentVersionDto,
  CustomerDocumentsDto,
  kanbanApi,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import ConfirmActionModal from "@/components/Common/ConfirmActionModal";

/** Catalogo fixo da ficha (ADR 017); o BFF devolve o mesmo rotulo no modo edicao. */
export const CUSTOMER_DOCUMENT_CATALOG: Array<{ type: CustomerDocumentType; label: string }> = [
  { type: "identidade", label: "RG ou CNH" },
  { type: "cpf", label: "CPF" },
  { type: "comprovante_residencia", label: "Comprovante de residência atual" },
  { type: "declaracao_residencia_terceiro", label: "Declaração de residência de terceiros (assinada)" },
  { type: "extrato_beneficio", label: "HISCON — Histórico de Consignado" },
  { type: "promobank", label: "Promobank — Extrato de Empréstimos" },
  { type: "hiscred", label: "HISCRED — Histórico de Crédito" },
];

export const CUSTOMER_DOCUMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";
const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export interface StagedCustomerDocuments extends CustomerDocumentProfileDto {
  files: Partial<Record<CustomerDocumentType, File>>;
}

export const EMPTY_STAGED_DOCUMENTS: StagedCustomerDocuments = { files: {}, residenceProofThirdParty: false, cpfOnIdentity: false };

/** HISCON ou Promobank: um dos dois para validar (mesma regra do BFF, 2026-11-02). */
export const EXTRACT_ALTERNATIVES: CustomerDocumentType[] = ["extrato_beneficio", "promobank"];

/** Aviso dos extratos: um basta para validar; o HISCON segue exigido para avancar o card. */
export const EXTRACT_NOTE = "HISCON ou Promobank: basta um para validar. O HISCON é exigido depois, para a Análise de Ações.";

/**
 * Exigidos um a um (mesma regra do BFF): declaracao so com comprovante de terceiro; CPF dispensado quando
 * ja esta no RG novo/CNH. HISCON e Promobank ficam fora: valem pelo `EXTRACT_ALTERNATIVES`.
 */
export function requiredCustomerDocumentTypes(profile: CustomerDocumentProfileDto): CustomerDocumentType[] {
  return CUSTOMER_DOCUMENT_CATALOG.map((item) => item.type).filter((type) => {
    if (EXTRACT_ALTERNATIVES.includes(type)) return false;
    if (type === "declaracao_residencia_terceiro") return profile.residenceProofThirdParty;
    if (type === "cpf") return !profile.cpfOnIdentity;
    return true;
  });
}

const REVIEW_STATUS_LABEL: Record<NonNullable<CustomerDocumentReviewDto["status"]>, string> = {
  ok: "ok",
  pendente: "pendente",
  ilegivel: "ilegível",
  divergente: "divergente",
};

/**
 * Selo do arquivo atual: depois do parecer da IA mostra Recusado/Aprovado em vez de
 * "Enviado"; arquivo substituido depois do parecer volta a "Enviado" ate nova validacao.
 */
export function documentBadge(
  current: CustomerDocumentVersionDto,
  review: CustomerDocumentReviewDto | null,
): { color: string; text: string; title: string } {
  if (review?.outcome === "nao_conferido") {
    return { color: "secondary", text: "Não conferido pela IA", title: "Documento não liberado para a rotina de validação" };
  }
  if (review?.outcome === "recusado") {
    return {
      color: "danger",
      text: `Recusado · ${review.status ? REVIEW_STATUS_LABEL[review.status] : "pendente"}`,
      title: review.note || `Recusado pela IA (${review.status ? REVIEW_STATUS_LABEL[review.status] : "pendente"})`,
    };
  }
  if (review?.outcome === "aprovado") {
    return { color: "success", text: "Aprovado pela IA", title: review.note || current.fileName };
  }
  return { color: "info", text: `Enviado · v${current.version}`, title: current.fileName };
}

/** Mesmo limite do BFF; evita enviar o que sera recusado. */
export function localFileError(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return "Envie PDF, PNG, JPEG ou WebP.";
  if (file.size <= 0 || file.size > MAX_SIZE_BYTES) return "O arquivo deve ter até 25 MB.";
  return null;
}

/**
 * Envia a fila do cadastro novo depois que o cliente existe. Devolve os tipos
 * que falharam (com mensagem) para reabrir a etapa em modo edicao.
 */
export async function uploadStagedCustomerDocuments(
  customerId: string,
  staged: StagedCustomerDocuments,
): Promise<Array<{ type: CustomerDocumentType; message: string }>> {
  const failures: Array<{ type: CustomerDocumentType; message: string }> = [];
  if (staged.residenceProofThirdParty || staged.cpfOnIdentity) {
    try {
      await kanbanApi.customerDocuments.updateProfile(customerId, {
        residenceProofThirdParty: staged.residenceProofThirdParty,
        cpfOnIdentity: staged.cpfOnIdentity,
      });
    } catch (error) {
      const type = staged.residenceProofThirdParty ? "declaracao_residencia_terceiro" : "cpf";
      failures.push({ type, message: describeKanbanError(error, "Erro ao salvar as marcações dos documentos") });
    }
  }
  const required = new Set(requiredCustomerDocumentTypes(staged));
  for (const { type } of CUSTOMER_DOCUMENT_CATALOG) {
    const file = staged.files[type];
    // Arquivo de documento que deixou de ser exigido (ex.: CPF dispensado) nao e enviado.
    if (!file || !(required.has(type) || EXTRACT_ALTERNATIVES.includes(type))) continue;
    try {
      await kanbanApi.customerDocuments.upload(customerId, type, file);
    } catch (error) {
      failures.push({ type, message: describeKanbanError(error, "Erro ao enviar documento") });
    }
  }
  return failures;
}

interface Props {
  customerId: string | null;
  staged: StagedCustomerDocuments;
  onStagedChange: (value: StagedCustomerDocuments) => void;
  notice?: string | null;
}

export default function CustomerDocumentsStep({ customerId, staged, onStagedChange, notice }: Props) {
  return (
    <>
      <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-3">
        <i className="ri-folder-shield-2-line me-1" />Documentos
      </p>
      {notice && <Alert color="warning">{notice}</Alert>}
      {customerId ? (
        <LiveDocuments customerId={customerId} />
      ) : (
        <StagedDocuments staged={staged} onChange={onStagedChange} />
      )}
    </>
  );
}

function StagedDocuments({ staged, onChange }: { staged: StagedCustomerDocuments; onChange: (value: StagedCustomerDocuments) => void }) {
  const [error, setError] = useState<string | null>(null);
  const required = new Set(requiredCustomerDocumentTypes(staged));
  const extractDone = EXTRACT_ALTERNATIVES.some((type) => staged.files[type]);
  const done = [...required].filter((type) => staged.files[type]).length + (extractDone ? 1 : 0);
  return (
    <>
      <p className="text-muted small">
        Os arquivos são enviados ao salvar o cliente. Os documentos não são obrigatórios para salvar, mas os marcados
        com * são exigidos para validar os dados. {EXTRACT_NOTE}
      </p>
      {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
      <ProfileToggles profile={staged} onChange={(patch) => onChange({ ...staged, ...patch })} />
      <Progress done={done} total={required.size + 1} />
      <Table className="align-middle mb-0" size="sm">
        <tbody>
          {CUSTOMER_DOCUMENT_CATALOG.filter((item) => required.has(item.type) || EXTRACT_ALTERNATIVES.includes(item.type)).map((item) => {
            const file = staged.files[item.type];
            const alternative = EXTRACT_ALTERNATIVES.includes(item.type);
            return (
              <tr key={item.type}>
                <td>
                  {item.label} *{alternative && <div className="small text-muted">um dos dois: HISCON ou Promobank</div>}
                </td>
                <td>
                  {file ? (
                    <Badge color="info">Na fila: {file.name}</Badge>
                  ) : alternative && extractDone ? (
                    <Badge color="light" className="text-muted">Opcional</Badge>
                  ) : (
                    <Badge color="warning">Pendente</Badge>
                  )}
                </td>
                <td className="text-end">
                  <FilePicker
                    label={file ? "Trocar" : "Selecionar"}
                    onPick={(picked) => {
                      const message = localFileError(picked);
                      if (message) { setError(message); return; }
                      onChange({ ...staged, files: { ...staged.files, [item.type]: picked } });
                    }}
                  />
                  {file && (
                    <Button size="sm" color="link" className="text-danger" onClick={() => {
                      const files = { ...staged.files };
                      delete files[item.type];
                      onChange({ ...staged, files });
                    }}>Tirar</Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}

function LiveDocuments({ customerId }: { customerId: string }) {
  const [data, setData] = useState<CustomerDocumentsDto | null>(null);
  const [removing, setRemoving] = useState<{ type: CustomerDocumentType; label: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await kanbanApi.customerDocuments.list(customerId));
      setError(null);
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar documentos"));
    }
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  async function run(key: string, action: () => Promise<CustomerDocumentsDto | void>, label?: string) {
    setBusy(key);
    setError(null);
    try {
      const result = await action();
      if (result) setData(result);
    } catch (err) {
      const message = describeKanbanError(err, "Erro ao atualizar documentos");
      setError(label ? `${label}: ${message}` : message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return error ? <Alert color="danger">{error}</Alert> : <div className="text-center py-4"><Spinner color="primary" /></div>;

  const required = data.items.filter((item) => item.required);
  const hasExtract = data.items.some((item) => item.oneOf === "extrato");
  const extractDone = data.items.some((item) => item.oneOf === "extrato" && item.current);
  const done = required.filter((item) => item.current).length + (extractDone ? 1 : 0);
  return (
    <>
      <p className="text-muted small">
        Cada envio é gravado na hora. Todos os documentos exigidos liberam a validação dos dados. {EXTRACT_NOTE}
      </p>
      {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
      <ProfileToggles
        profile={data}
        disabled={busy !== null}
        onChange={(patch) => void run("profile", () => kanbanApi.customerDocuments.updateProfile(customerId, patch))}
      />
      <Progress done={done} total={required.length + (hasExtract ? 1 : 0)} />
      <Table className="align-middle mb-0" size="sm">
        <tbody>
          {data.items.filter((item) => item.required || item.oneOf || item.current).map((item) => (
            <tr key={item.type}>
              <td>
                {item.label}{item.required || item.oneOf ? " *" : ""}
                {item.oneOf && <div className="small text-muted">um dos dois: HISCON ou Promobank</div>}
              </td>
              <td>
                {item.current ? (
                  <DocumentStatus current={item.current} review={item.review} />
                ) : item.oneOf && extractDone ? (
                  <Badge color="light" className="text-muted">Opcional</Badge>
                ) : (
                  <Badge color="warning">Pendente</Badge>
                )}
              </td>
              <td className="text-end text-nowrap">
                {busy === item.type ? <Spinner size="sm" /> : (
                  <>
                    <FilePicker
                      label={item.current ? "Substituir" : "Enviar"}
                      disabled={busy !== null}
                      onPick={(file) => {
                        const message = localFileError(file);
                        if (message) { setError(message); return; }
                        void run(item.type, () => kanbanApi.customerDocuments.upload(customerId, item.type, file), item.label);
                      }}
                    />
                    {item.current && (
                      <>
                        <Button size="sm" color="link" disabled={busy !== null} onClick={() => void run(item.type, async () => {
                          const { url } = await kanbanApi.customerDocuments.downloadUrl(customerId, item.current!.id);
                          window.open(url, "_blank", "noopener,noreferrer");
                        })}>Baixar</Button>
                        <Button size="sm" color="link" className="text-danger" disabled={busy !== null}
                          onClick={() => setRemoving({ type: item.type, label: item.label })}>Remover</Button>
                      </>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <ConfirmActionModal
        isOpen={removing !== null}
        title={`Remover ${removing?.label ?? "documento"}?`}
        icon="ri-delete-bin-line"
        color="danger"
        confirmLabel="Remover"
        busy={busy !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target) void run(target.type, () => kanbanApi.customerDocuments.remove(customerId, target.type));
        }}
      >
        <p className="mb-0">O arquivo sai da ficha; a versão fica no histórico. Se ele entrou na validação, ela deixa de valer.</p>
      </ConfirmActionModal>
    </>
  );
}

function DocumentStatus({ current, review }: { current: CustomerDocumentVersionDto; review: CustomerDocumentReviewDto | null }) {
  const badge = documentBadge(current, review);
  return (
    <>
      <Badge color={badge.color} title={badge.title}>{badge.text}</Badge>
      {review?.outcome === "recusado" && review.note && <div className="small text-danger mt-1">{review.note}</div>}
    </>
  );
}

function ProfileToggles({
  profile,
  disabled,
  onChange,
}: {
  profile: CustomerDocumentProfileDto;
  disabled?: boolean;
  onChange: (patch: Partial<CustomerDocumentProfileDto>) => void;
}) {
  return (
    <div className="mb-3">
      <FormGroup switch className="mb-1">
        <Input
          id="customer-cpf-on-identity"
          type="switch"
          checked={profile.cpfOnIdentity}
          disabled={disabled}
          onChange={(event) => onChange({ cpfOnIdentity: event.target.checked })}
        />
        <Label for="customer-cpf-on-identity" check>
          CPF já consta no RG (modelo novo) ou na CNH (dispensa o documento CPF; a IA confere o número)
        </Label>
      </FormGroup>
      <FormGroup switch className="mb-0">
        <Input
          id="customer-residence-third-party"
          type="switch"
          checked={profile.residenceProofThirdParty}
          disabled={disabled}
          onChange={(event) => onChange({ residenceProofThirdParty: event.target.checked })}
        />
        <Label for="customer-residence-third-party" check>
          Comprovante de residência em nome de terceiro (exige a declaração assinada)
        </Label>
      </FormGroup>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <p className="small mb-2">
      <Badge color={done === total ? "success" : "secondary"} className="me-1">{done} de {total}</Badge>
      documentos exigidos enviados
    </p>
  );
}

function FilePicker({ label, disabled, onPick }: { label: string; disabled?: boolean; onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept={CUSTOMER_DOCUMENT_ACCEPT}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
      <Button size="sm" outline color="primary" disabled={disabled} onClick={() => input.current?.click()}>{label}</Button>
    </>
  );
}
