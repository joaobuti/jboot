"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Input, Spinner, Table } from "reactstrap";
import { getApplicationScopes } from "@/lib/module-auth-token";
import {
  CustomerValidationOfficeOptionDto,
  CustomerValidationRunDto,
  CustomerValidationStatus,
  CustomerValidationStatusDto,
  kanbanApi,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { CUSTOMER_DOCUMENT_CATALOG } from "./CustomerDocumentsStep";
import KitReviewPanel from "./KitReviewPanel";
import ConfirmActionModal from "@/components/Common/ConfirmActionModal";

const STATUS_LABEL: Record<CustomerValidationStatus, { text: string; color: string }> = {
  documentos_incompletos: { text: "Documentos pendentes", color: "warning" },
  em_validacao: { text: "Em validação pelo Claude", color: "info" },
  aguardando_confirmacao: { text: "Parecer recebido: aguardando confirmação", color: "primary" },
  validado: { text: "Validado", color: "success" },
  nao_validado: { text: "Não validado", color: "secondary" },
};

const FINDING_LABEL: Record<string, { text: string; color: string }> = {
  ok: { text: "OK", color: "success" },
  pendente: { text: "Pendente", color: "warning" },
  ilegivel: { text: "Ilegível", color: "danger" },
  divergente: { text: "Divergente", color: "danger" },
};

const RUN_LABEL: Record<CustomerValidationRunDto["status"], string> = {
  dispatching: "Enviando",
  dispatched: "Enviado ao Claude",
  answered: "Parecer recebido",
  failed: "Falhou",
  expired: "Sem resposta",
};

/** Motivo legivel do run encerrado sem parecer; codigo desconhecido aparece como veio. */
const RUN_ERROR_LABEL: Record<string, string> = {
  routine_not_reached: "o Claude não conseguiu acessar o Flow (túnel, conector ou autorização). Corrija a conexão e valide de novo",
  routine_no_answer: "o Claude parou de responder. Valide de novo",
};


const DOCUMENT_LABEL = new Map(CUSTOMER_DOCUMENT_CATALOG.map((item) => [item.type, item.label]));
const POLL_MS = 15_000;

/** Permissao de confirmar o parecer da IA (ADR 018). */
export const VALIDATION_APPROVE_SCOPE = "flow:validation:approve";

export function canRequestValidation(status: CustomerValidationStatusDto, officeId = ""): boolean {
  if (!status.documentsComplete || status.status === "em_validacao") return false;
  if (status.offices.length > 1) {
    const office = status.offices.find((item) => item.id === officeId);
    return Boolean(office && office.route !== "none");
  }
  return status.configured;
}

export const ROUTE_LABEL: Record<CustomerValidationOfficeOptionDto["route"], string> = {
  office: "conta Claude do escritório",
  central: "conta principal",
  none: "sem rotina configurada",
};

/** Rotulos dos campos da ficha que a IA pode preencher (S6). */
export const APPLIED_FIELD_LABEL: Record<string, string> = {
  dataNascimento: "Data de nascimento",
  nacionalidade: "Nacionalidade",
  estadoCivil: "Estado civil",
  profissao: "Profissão",
  rgNumero: "RG",
  rgOrgaoEmissor: "Órgão emissor do RG",
  rgUf: "UF do RG",
  nomeMae: "Nome da mãe",
  numeroBeneficio: "Número do benefício",
  especieBeneficio: "Espécie do benefício",
  bancoPagamento: "Banco de pagamento",
  addressZip: "CEP",
  addressStreet: "Logradouro",
  addressNumber: "Número",
  addressComplement: "Complemento",
  addressNeighborhood: "Bairro",
  addressCity: "Cidade",
  addressState: "UF do endereço",
};

/** Aviso do kit do escritorio na confirmacao (ADR 019, decisao 19): resultado, Drive e o que revisar. */
export function kitNotice(run: Pick<CustomerValidationRunDto, "kitResult" | "kit">): { color: string; lines: string[] } | null {
  switch (run.kitResult) {
    case null:
      return null;
    case "not_approved":
      return { color: "secondary", lines: ["Kit não gerado: o parecer tinha pendências."] };
    case "no_model":
      return { color: "warning", lines: ["Kit não gerado: o escritório não tinha modelo do kit no pedido da validação."] };
    case "model_not_docx":
      return { color: "warning", lines: ["Kit não gerado: o modelo do escritório é do editor antigo. Envie o .docx em Escritórios → Contrato Serviços e valide de novo."] };
    case "failed":
      return { color: "danger", lines: ["Kit não gerado por uma falha na montagem. Confira o modelo do escritório e valide de novo."] };
  }
  const kit = run.kit;
  if (!kit) return { color: "success", lines: ["Kit gerado."] };
  const drive =
    kit.driveState === "synced"
      ? "enviado ao Drive, na pasta do cliente."
      : kit.driveState === "failed"
        ? "o envio ao Drive falhou; veja a fila em Configurações → Drive."
        : kit.driveActive || kit.driveState
          ? "aguardando envio ao Drive."
          : "aguardando Drive: ele sobe quando o Drive da empresa for ligado.";
  const lines = [`Kit ${kit.fileName}: ${drive}`, "Para baixar, abra o card do cliente: bloco Documentos."];
  const empty = kit.report.emptyTags ?? [];
  if (empty.length > 0) {
    lines.push(`${empty.length} campo(s) sem valor ficaram como [[CAMPO]] para o advogado corrigir: ${empty.join(", ")}.`);
  }
  const marks = kit.report.unresolvedMarks ?? [];
  if (marks.length > 0) lines.push(`Marcas que ficaram como no modelo: ${marks.join(", ")}.`);
  const warnings = kit.report.warnings ?? [];
  if (warnings.some((warning) => warning.code === "cpf_differs_from_customer")) {
    lines.push("O CPF do kit é diferente do CPF da ficha.");
  }
  if (warnings.some((warning) => warning.code === "waiver_jef_not_applied")) {
    lines.push("A ação é no JEF, mas o modelo não tem o trecho da renúncia para trocar: ajuste o Termo de Renúncia no arquivo.");
  }
  return { color: empty.length > 0 || marks.length > 0 || warnings.length > 0 ? "warning" : "success", lines };
}

export function canConfirm(run: CustomerValidationRunDto | undefined): boolean {
  return Boolean(run && run.status === "answered" && !run.confirmedAt && run.matchesCurrentDocuments);
}

interface Props {
  customerId: string | null;
  /** Avisado uma vez por parecer que preencheu campos vazios, para a ficha aberta nao sobrescreve-los. */
  onDataApplied?: (fields: string[]) => void;
  /** Muda quando chega `customer.updated` deste cliente: busca o parecer na hora, sem esperar a consulta. */
  reloadKey?: number;
}

export default function CustomerValidationStep({ customerId, onDataApplied, reloadKey = 0 }: Props) {
  const [data, setData] = useState<CustomerValidationStatusDto | null>(null);
  const notifiedRuns = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [officeId, setOfficeId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [canApprove] = useState(() => getApplicationScopes("app:flow").includes(VALIDATION_APPROVE_SCOPE));

  const load = useCallback(async () => {
    if (!customerId) return;
    try {
      setData(await kanbanApi.customerValidation.status(customerId));
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar a validação"));
    }
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (reloadKey > 0) void load();
  }, [reloadKey, load]);
  useEffect(() => {
    if (data?.status !== "em_validacao") return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [data?.status, load]);

  const latestRun = data?.runs[0];
  useEffect(() => {
    const fields = latestRun?.appliedFields ?? [];
    if (!latestRun || fields.length === 0 || notifiedRuns.current.has(latestRun.id)) return;
    notifiedRuns.current.add(latestRun.id);
    onDataApplied?.(fields);
  }, [latestRun, onDataApplied]);

  async function act(action: () => Promise<CustomerValidationStatusDto>) {
    setBusy(true);
    setError(null);
    try {
      setData(await action());
    } catch (err) {
      setError(describeKanbanError(err, "Erro na validação"));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-3">
      <i className="ri-shield-check-line me-1" />Validação
    </p>
  );
  if (!customerId) return <>{header}<Alert color="info">Salve o cliente e envie os documentos para validar os dados.</Alert></>;
  if (!data) return <>{header}{error ? <Alert color="danger">{error}</Alert> : <div className="text-center py-4"><Spinner color="primary" /></div>}</>;

  const latest = data.runs[0];
  const label = STATUS_LABEL[data.status];
  return (
    <>
      {header}
      {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <Badge color={label.color} className="fs-6 px-3 py-2">{label.text}</Badge>
        <div className="d-flex gap-2">
          <Button size="sm" color="light" onClick={() => void load()} disabled={busy}><i className="ri-refresh-line" /></Button>
          <Button color="primary" size="sm" disabled={busy || !canRequestValidation(data, officeId)} onClick={() => void act(() => kanbanApi.customerValidation.requestValidation(customerId, data.offices.length > 1 ? officeId : undefined))}>
            {busy ? <Spinner size="sm" className="me-1" /> : <i className="ri-robot-2-line me-1" />}Validar dados
          </Button>
        </div>
      </div>
      {data.offices.length > 1 && (
        <div className="mb-3">
          <label htmlFor="validation-office" className="form-label small mb-1">Escritório que valida</label>
          <Input id="validation-office" type="select" bsSize="sm" value={officeId} onChange={(event) => setOfficeId(event.target.value)} disabled={busy}>
            <option value="">Escolha o escritório</option>
            {data.offices.map((office) => (
              <option key={office.id} value={office.id} disabled={office.route === "none"}>
                {office.name} ({ROUTE_LABEL[office.route]})
              </option>
            ))}
          </Input>
        </div>
      )}
      {data.offices.length === 1 && data.documentsComplete && (
        <p className="small text-muted">
          Validação pela {ROUTE_LABEL[data.offices[0].route]}
          {data.offices[0].route === "office" ? ` (${data.offices[0].name})` : ""}.
        </p>
      )}
      {!data.documentsComplete && (
        <p className="small text-muted">
          Faltam: {data.missing.map((type) => (type === "extrato_beneficio" ? "HISCON ou Promobank" : DOCUMENT_LABEL.get(type) ?? type)).join(", ")}. Envie na etapa Documentos.
        </p>
      )}
      {data.documentsComplete && !data.configured && (
        <Alert color="warning" className="small">O gestor ainda não configurou o agente em Configurações → IA → Validação de cadastro.</Alert>
      )}
      {latest && (
        <div className="border rounded p-3 mb-3">
          <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
            <span className="small">
              <strong>{RUN_LABEL[latest.status]}</strong>{" "}
              {latest.verdict && <Badge color={latest.verdict === "aprovado" ? "success" : "warning"}>{latest.verdict === "aprovado" ? "Aprovado pelo Claude" : "Com pendências"}</Badge>}
              {latest.errorCode && <span className="text-muted"> · {RUN_ERROR_LABEL[latest.errorCode] ?? latest.errorCode}</span>}
            </span>
            {latest.externalSessionUrl && (
              <a className="small" href={latest.externalSessionUrl} target="_blank" rel="noopener noreferrer">Ver sessão no Claude</a>
            )}
          </div>
          {latest.summary && <p className="small mb-2">{latest.summary}</p>}
          {latest.appliedFields?.length > 0 && (
            <Alert color="info" className="small mb-2">
              <i className="ri-magic-line me-1" />Dados gravados na ficha pela IA (jurídicos que estavam vazios e endereço do comprovante):{" "}
              {latest.appliedFields.map((field) => APPLIED_FIELD_LABEL[field] ?? field).join(", ")}.
            </Alert>
          )}
          {latest.findings && latest.findings.length > 0 && (
            <Table size="sm" className="mb-2">
              <tbody>
                {latest.findings.map((finding) => (
                  <tr key={finding.documentType}>
                    <td>{DOCUMENT_LABEL.get(finding.documentType) ?? finding.documentType}</td>
                    <td><Badge color={FINDING_LABEL[finding.status]?.color ?? "secondary"}>{FINDING_LABEL[finding.status]?.text ?? finding.status}</Badge></td>
                    <td className="small text-muted">{finding.note}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {(latest.generalFindings?.length ?? 0) > 0 && (
            <Alert color="warning" className="small mb-2">
              <strong>Pendências:</strong>
              <ul className="mb-0 ps-3">{latest.generalFindings!.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </Alert>
          )}
          {(latest.alerts?.length ?? 0) > 0 && (
            <Alert color="info" className="small mb-2">
              <strong>Alertas:</strong>
              <ul className="mb-0 ps-3">{latest.alerts!.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </Alert>
          )}
          {latest.status === "answered" && !latest.confirmedAt && !latest.matchesCurrentDocuments && (
            <Alert color="warning" className="small mb-2">Os documentos mudaram depois deste parecer. Valide de novo.</Alert>
          )}
          {latest.confirmedAt && <p className="small text-success mb-0"><i className="ri-check-double-line me-1" />Validação confirmada.</p>}
          {latest.confirmedAt && latest.intakeResult && <IntakeNotice run={latest} />}
          {latest.confirmedAt && <KitNotice run={latest} />}
          {canConfirm(latest) && !canApprove && (
            <p className="small text-muted mb-0"><i className="ri-lock-line me-1" />Aguardando quem tem a permissão de aprovar o parecer.</p>
          )}
          {canConfirm(latest) && canApprove && (
            <div className="d-flex justify-content-end">
              <Button color="success" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
                <i className="ri-check-line me-1" />Confirmar validação
              </Button>
            </div>
          )}
        </div>
      )}
      {latest && (
        <ConfirmActionModal
          isOpen={confirming}
          title="Confirmar a validação?"
          icon={latest.verdict === "pendencias" ? "ri-error-warning-line" : "ri-shield-check-line"}
          color={latest.verdict === "pendencias" ? "warning" : "success"}
          confirmLabel="Confirmar validação"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void act(() => kanbanApi.customerValidation.confirm(customerId, latest.id)).then(() => setConfirming(false))}
        >
          {latest.verdict === "pendencias" ? (
            <p className="text-warning mb-2"><strong>O Claude apontou pendências.</strong> Confirme só se elas já foram resolvidas ou aceitas pelo escritório.</p>
          ) : (
            <p className="mb-2">O Claude aprovou os documentos{(latest.alerts?.length ?? 0) > 0 ? ` com ${latest.alerts!.length} alerta(s) para conferir` : ""}.</p>
          )}
          <p className="mb-1">Ao confirmar:</p>
          <ul className="mb-0 ps-3">
            <li>o cliente passa a <strong>Validado</strong>;</li>
            <li>os documentos validados vão para o Drive da empresa (se ligado);</li>
            <li>um card do cliente é criado na coluna <strong>BACKLOG</strong> do board de entrada do escritório (se configurado), com os responsáveis do escritório como responsáveis do card;</li>
            <li>{latest.verdict === "aprovado" ? <>o <strong>kit do escritório</strong> é gerado com os valores do kit, fica para baixar no bloco Documentos do card do cliente e vai ao Drive, na pasta do cliente, quando o Drive estiver ligado; campo sem valor fica como [[CAMPO]] para o advogado corrigir;</> : <>o kit do escritório <strong>não</strong> é gerado, porque o parecer tem pendências;</>}</li>
            <li>as automações dos cards (ex.: Análise de Ações) passam a ler este cliente.</li>
          </ul>
        </ConfirmActionModal>
      )}
      {latest?.status === "answered" && latest.verdict === "aprovado" && data.kitModel?.runId === latest.id && (
        <KitReviewPanel customerId={customerId} run={latest} kitModel={data.kitModel} canApprove={canApprove && !latest.confirmedAt} onSaved={setData} />
      )}
    </>
  );
}

const INTAKE_MESSAGE: Record<NonNullable<CustomerValidationRunDto["intakeResult"]>, { color: string; text: string }> = {
  created: { color: "success", text: "Card criado na coluna BACKLOG." },
  existing: { color: "info", text: "O cliente já tinha card ativo neste board; nenhum card novo foi criado." },
  no_office: { color: "warning", text: "Card não criado: a validação não tem escritório." },
  no_board: { color: "warning", text: "Card não criado: o escritório não tem board de entrada (Configurações → IA → Validação de cadastro)." },
  no_backlog: { color: "warning", text: "Card não criado: o board de entrada não tem a coluna BACKLOG." },
  failed: { color: "danger", text: "Card não criado por uma falha. Crie o card manualmente ou tente de novo." },
};

function KitNotice({ run }: { run: CustomerValidationRunDto }) {
  const notice = kitNotice(run);
  if (!notice) return null;
  return (
    <Alert color={notice.color} className="small mt-2 mb-0">
      <i className="ri-file-word-line me-1" />
      {notice.lines[0]}
      {notice.lines.slice(1).map((line) => <div key={line} className="mt-1">{line}</div>)}
    </Alert>
  );
}

/** Responsaveis do card criado: quem foi atribuido e quem ficou de fora, com o motivo. */
export function intakeAssigneeLines(run: Pick<CustomerValidationRunDto, "intakeResult" | "intakeAssignees">): string[] {
  if (run.intakeResult !== "created" || !run.intakeAssignees) return [];
  const { assigned, skipped, error } = run.intakeAssignees;
  if (error) return ["Responsável não definido por uma falha. Defina o responsável no card."];
  const name = (item: { name: string | null }) => item.name ?? "usuário sem nome";
  const lines: string[] = [];
  if (assigned.length > 0) lines.push(`Responsável: ${assigned.map(name).join(", ")}.`);
  for (const item of skipped) {
    lines.push(
      item.reason === "not_board_member"
        ? `${name(item)} não virou responsável: não é membro do board de entrada. Adicione-o ao board e defina no card.`
        : `${name(item)} não virou responsável: não tem acesso ao escritório do card.`,
    );
  }
  if (assigned.length === 0 && skipped.length === 0) {
    lines.push("Card sem responsável: o escritório não tem responsável marcado em Escritórios → Usuários.");
  }
  return lines;
}

/** Resultado do card automatico da confirmacao (ADR 019, decisao 16), com link para o card. */
function IntakeNotice({ run }: { run: CustomerValidationRunDto }) {
  const message = INTAKE_MESSAGE[run.intakeResult!];
  const href = run.intakeBoardId && run.intakeCardId ? `/flow/boards/${run.intakeBoardId}?card=${run.intakeCardId}` : null;
  const assignees = intakeAssigneeLines(run);
  const missing = run.intakeResult === "created" && (run.intakeAssignees?.assigned.length ?? 0) === 0;
  return (
    <Alert color={missing ? "warning" : message.color} className="small mt-2 mb-0">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span><i className="ri-layout-column-line me-1" />{message.text}</span>
        {href && <a href={href} className="fw-semibold">Abrir card</a>}
      </div>
      {assignees.map((line) => <div key={line} className="mt-1">{line}</div>)}
    </Alert>
  );
}
