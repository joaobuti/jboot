"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Col, Form, FormGroup, Input, Label,
  Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner, Table,
} from "reactstrap";
import {
  FlowCustomerDetailDto, FlowCustomerSummaryDto, FlowCustomerWritePayload, KanbanApiError,
  ActiveOfficeStateDto, OfficeDto, kanbanApi,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import CustomerDocumentsStep, {
  CUSTOMER_DOCUMENT_CATALOG, EMPTY_STAGED_DOCUMENTS, StagedCustomerDocuments, uploadStagedCustomerDocuments,
} from "./CustomerDocumentsStep";
import CustomerPriorLawsuitsStep from "./CustomerPriorLawsuitsStep";
import { brDateToIso, isoToBrDate } from "@/modules/kanban/lib/br-date";
import CustomerValidationStep from "./CustomerValidationStep";
import { connectKanbanSocket, type CustomerUpdatedEvent } from "@/modules/kanban/lib/kanban-socket";
import { alertOpensValidation, canValidateFromList, documentationAlert } from "./customer-documentation-alert";

const PAGE_SIZE = 20;
const EMPTY_FORM = {
  name: "", documentNumber: "", email: "", phone: "", officeIds: [] as string[],
  dataNascimento: "", nacionalidade: "", estadoCivil: "", profissao: "", rgNumero: "",
  rgOrgaoEmissor: "", rgUf: "", nomeMae: "", numeroBeneficio: "", especieBeneficio: "",
  bancoPagamento: "", observacoes: "", hipossuficienciaDeclarada: false,
};

type FormState = typeof EMPTY_FORM;
type Step = "general" | "legal" | "lawsuits" | "offices" | "documents" | "validation";

const STEPS: Array<{ id: Step; label: string; icon: string }> = [
  { id: "general", label: "Dados gerais", icon: "ri-file-text-line" },
  { id: "legal", label: "Dados jurídicos", icon: "ri-file-list-3-line" },
  { id: "lawsuits", label: "Ações ajuizadas", icon: "ri-scales-3-line" },
  { id: "offices", label: "Escritórios", icon: "ri-building-line" },
  { id: "documents", label: "Documentos", icon: "ri-folder-shield-2-line" },
  { id: "validation", label: "Validação", icon: "ri-shield-check-line" },
];

export default function FlowCustomersPage() {
  const [rows, setRows] = useState<FlowCustomerSummaryDto[]>([]);
  const [offices, setOffices] = useState<OfficeDto[]>([]);
  /** Quem nao escolhe o escritorio cadastra no seu escritorio ativo (flow-offices-sprints.md, S2). */
  const [myOffice, setMyOffice] = useState<ActiveOfficeStateDto | null>(null);
  const canChooseOffices = myOffice?.canChooseCustomerOffices ?? false;
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationConfigured, setValidationConfigured] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FlowCustomerDetailDto | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [step, setStep] = useState<Step>("general");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [stagedDocuments, setStagedDocuments] = useState<StagedCustomerDocuments>(EMPTY_STAGED_DOCUMENTS);
  const [documentsNotice, setDocumentsNotice] = useState<string | null>(null);
  const [cardsCustomer, setCardsCustomer] = useState<FlowCustomerSummaryDto | null>(null);
  const [cards, setCards] = useState<Awaited<ReturnType<typeof kanbanApi.customers.cards>>>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [boards, setBoards] = useState<Awaited<ReturnType<typeof kanbanApi.boards.list>>["data"]>([]);
  const [columns, setColumns] = useState<Awaited<ReturnType<typeof kanbanApi.columns.list>>["data"]>([]);
  const [cardForm, setCardForm] = useState({ boardId: "", columnId: "", officeId: "", title: "" });
  const [cardSaving, setCardSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  // `silent`: recarga por aviso em tempo real, sem voltar a lista ao carregando.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [customers, officeContext, mine] = await Promise.all([
        kanbanApi.customers.list({ page, pageSize: PAGE_SIZE, search: appliedSearch || undefined }),
        kanbanApi.offices.context(),
        kanbanApi.offices.myOffice().catch(() => null),
      ]);
      setMyOffice(mine);
      setRows(customers.data);
      setTotal(customers.total);
      setValidationConfigured(customers.validationConfigured);
      setOffices(officeContext.offices.filter((office) => office.active));
      setForbidden(false);
    } catch (err) {
      if (err instanceof KanbanApiError && err.status === 403) setForbidden(true);
      else setError(describeKanbanError(err, "Erro ao carregar clientes"));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, page]);

  useEffect(() => { void load(); }, [load]);

  // Ficha alterada fora desta tela (ex.: parecer da IA): recarrega a lista e a validacao aberta
  // (docs/product/flow-realtime-card-updates-sprints.md, R1). O aviso traz so o id; o HTTP aplica a visibilidade.
  const [liveCustomer, setLiveCustomer] = useState<{ customerId: string; seq: number } | null>(null);
  const liveSeqRef = useRef(0);
  useEffect(() => {
    if (forbidden) return;
    const socket = connectKanbanSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;
    socket.on("customer.updated", (event: CustomerUpdatedEvent) => {
      liveSeqRef.current += 1;
      setLiveCustomer({ customerId: event.customerId, seq: liveSeqRef.current });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(true), 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      socket.disconnect();
    };
  }, [load, forbidden]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const officeNames = useMemo(() => new Map(offices.map((office) => [office.id, office.name])), [offices]);

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setStep("general"); setFormError(null);
    setStagedDocuments(EMPTY_STAGED_DOCUMENTS); setDocumentsNotice(null); setModalOpen(true);
  }

  async function openEdit(row: FlowCustomerSummaryDto, initialStep: Step = "general") {
    setFormError(null); setDocumentsNotice(null);
    try {
      const detail = await kanbanApi.customers.get(row.id);
      const legal = detail.juridico ?? {};
      setEditing(detail);
      setForm({
        name: detail.name, documentNumber: "", email: detail.email ?? "", phone: detail.phone ?? "",
        officeIds: detail.officeIds, dataNascimento: isoToBrDate(legal.dataNascimento), nacionalidade: legal.nacionalidade ?? "",
        estadoCivil: legal.estadoCivil ?? "", profissao: legal.profissao ?? "", rgNumero: legal.rgNumero ?? "",
        rgOrgaoEmissor: legal.rgOrgaoEmissor ?? "", rgUf: legal.rgUf ?? "", nomeMae: legal.nomeMae ?? "",
        numeroBeneficio: legal.numeroBeneficio ?? "", especieBeneficio: legal.especieBeneficio ?? "",
        bancoPagamento: legal.bancoPagamento ?? "", observacoes: legal.observacoes ?? "",
        hipossuficienciaDeclarada: legal.hipossuficienciaDeclarada ?? false,
      });
      setStep(initialStep); setModalOpen(true);
    } catch (err) { setError(describeKanbanError(err, "Erro ao abrir cliente")); }
  }

  /**
   * S6: a IA preencheu campos vazios no servidor. Copia so esses campos para a ficha
   * aberta, e so onde o formulario ainda esta vazio, para salvar nao apagar o valor.
   */
  async function mergeAppliedFields(fields: string[]) {
    if (!editing) return;
    try {
      const legal = (await kanbanApi.customers.get(editing.id)).juridico ?? {};
      setForm((current) => {
        const next = { ...current };
        for (const field of fields) {
          const value = (legal as Record<string, unknown>)[field];
          if (field in next && typeof value === "string" && String(next[field as keyof FormState]) === "") {
            (next as Record<string, unknown>)[field] = field === "dataNascimento" ? isoToBrDate(value) : value;
          }
        }
        return next;
      });
    } catch (err) { setFormError(describeKanbanError(err, "Erro ao atualizar a ficha com os dados da IA")); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || (canChooseOffices && form.officeIds.length === 0)) {
      setFormError(canChooseOffices ? "Informe o nome e ao menos um escritório." : "Informe o nome."); return;
    }
    const cpfEditable = !editing || !editing.maskedDocumentNumber;
    if (!editing && !form.documentNumber.trim()) {
      setFormError("Informe o CPF: ele é obrigatório e nomeia a pasta do cliente no Drive."); setStep("general"); return;
    }
    const birthDate = nullable(form.dataNascimento);
    const birthDateIso = birthDate ? brDateToIso(birthDate) : null;
    if (birthDate && !birthDateIso) {
      setFormError("Data de nascimento inválida: use DD/MM/AAAA."); setStep("legal"); return;
    }
    setSaving(true); setFormError(null);
    try {
      const legal = {
        dataNascimento: birthDateIso, nacionalidade: nullable(form.nacionalidade),
        estadoCivil: nullable(form.estadoCivil), profissao: nullable(form.profissao), rgNumero: nullable(form.rgNumero),
        rgOrgaoEmissor: nullable(form.rgOrgaoEmissor), rgUf: nullable(form.rgUf)?.toUpperCase() ?? null,
        nomeMae: nullable(form.nomeMae), numeroBeneficio: nullable(form.numeroBeneficio),
        especieBeneficio: nullable(form.especieBeneficio), bancoPagamento: nullable(form.bancoPagamento),
        observacoes: nullable(form.observacoes), hipossuficienciaDeclarada: form.hipossuficienciaDeclarada,
      };
      const core = { name: form.name.trim(), email: nullable(form.email), phone: nullable(form.phone), juridico: legal };
      if (editing) {
        await kanbanApi.customers.update(editing.id, {
          ...core, ...(cpfEditable && form.documentNumber.trim() ? { documentNumber: form.documentNumber.trim() } : {}),
        });
        if (canChooseOffices && !sameIds(editing.officeIds, form.officeIds)) {
          await kanbanApi.customers.update(editing.id, { officeIds: form.officeIds, officeLinkReason: "Atualização administrativa pela tela de clientes" });
        }
      } else {
        const payload: FlowCustomerWritePayload = {
          ...core, documentNumber: form.documentNumber.trim(), ...(canChooseOffices ? { officeIds: form.officeIds } : {}),
        };
        const created = await kanbanApi.customers.create(payload);
        const failures = await uploadStagedCustomerDocuments(created.id, stagedDocuments);
        if (failures.length > 0) {
          // Cliente ja existe: reabre em edicao na etapa Documentos para reenviar o que falhou.
          const labels = new Map(CUSTOMER_DOCUMENT_CATALOG.map((item) => [item.type, item.label]));
          setEditing(created); setStagedDocuments(EMPTY_STAGED_DOCUMENTS); setStep("documents");
          setDocumentsNotice(`Cliente salvo, mas alguns documentos não foram enviados: ${failures
            .map((failure) => `${labels.get(failure.type)} (${failure.message})`).join("; ")}.`);
          await load();
          return;
        }
      }
      setModalOpen(false); await load();
    } catch (err) { setFormError(describeKanbanError(err, "Erro ao salvar cliente")); }
    finally { setSaving(false); }
  }

  async function validateFromList(row: FlowCustomerSummaryDto) {
    setValidatingId(row.id); setError(null); setNotice(null);
    try {
      const result = await kanbanApi.customerValidation.requestValidation(row.id);
      const latest = result.runs[0];
      // load() limpa o erro da pagina: recarrega antes de mostrar o resultado.
      await load();
      if (latest?.status === "failed") setError(`Não foi possível enviar ${row.name} para validação (${latest.errorCode ?? "falha"}).`);
      else setNotice(`${row.name} enviado para validação. O parecer aparece em Editar → Validação.`);
    } catch (err) {
      // Cliente com mais de um escritorio (ADR 018): a escolha fica na etapa Validacao.
      if (err instanceof KanbanApiError && err.code === "customer_validation_office_required") {
        setNotice(`${row.name} tem mais de um escritório: escolha qual valida.`);
        await openEdit(row, "validation");
      } else setError(describeKanbanError(err, "Erro ao validar dados"));
    }
    finally { setValidatingId(null); }
  }

  async function showCards(row: FlowCustomerSummaryDto) {
    setCardsCustomer(row); setCardsLoading(true); setError(null);
    setCardForm({ boardId: "", columnId: "", officeId: row.officeIds[0] ?? "", title: "" });
    setColumns([]); setCardError(null);
    try {
      const [linkedCards, boardPage] = await Promise.all([kanbanApi.customers.cards(row.id), kanbanApi.boards.list()]);
      setCards(linkedCards); setBoards(boardPage.data.filter((board) => board.status === "active"));
    }
    catch (err) { setError(describeKanbanError(err, "Erro ao carregar cards")); setCardsCustomer(null); }
    finally { setCardsLoading(false); }
  }

  async function selectBoard(boardId: string) {
    setCardForm((current) => ({ ...current, boardId, columnId: "" }));
    setCardError(null);
    if (!boardId) { setColumns([]); return; }
    try {
      const result = await kanbanApi.columns.list(boardId);
      setColumns(result.data.filter((column) => column.status === "active"));
    } catch (err) { setCardError(describeKanbanError(err, "Erro ao carregar colunas")); }
  }

  async function createCard(event: FormEvent) {
    event.preventDefault();
    if (!cardsCustomer || !cardForm.boardId || !cardForm.columnId || !cardForm.officeId || !cardForm.title.trim()) {
      setCardError("Informe quadro, coluna, escritório e título."); return;
    }
    setCardSaving(true); setCardError(null);
    try {
      await kanbanApi.customers.createCard(cardsCustomer.id, crypto.randomUUID(), { ...cardForm, title: cardForm.title.trim() });
      setCards(await kanbanApi.customers.cards(cardsCustomer.id));
      setCardForm((current) => ({ ...current, title: "" }));
    } catch (err) { setCardError(describeKanbanError(err, "Erro ao criar card")); }
    finally { setCardSaving(false); }
  }

  if (forbidden) return <Alert color="warning"><i className="ri-lock-line me-2" />Você não possui permissão para consultar clientes do Flow.</Alert>;

  return <>
    <Card>
      <CardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h5 className="mb-0">Clientes</h5>
        <Button color="primary" size="sm" onClick={openCreate}><i className="ri-user-add-line me-1" />Novo cliente</Button>
      </CardHeader>
      <CardBody>
        {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
        {notice && <Alert color="success" toggle={() => setNotice(null)}>{notice}</Alert>}
        <Form className="d-flex gap-2 mb-3" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()); }}>
          <Input aria-label="Buscar clientes" value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou documento" />
          <Button color="secondary" type="submit"><i className="ri-search-line" /></Button>
        </Form>
        {loading ? <div className="text-center py-5"><Spinner color="primary" /></div> : rows.length === 0 ?
          <p className="text-muted text-center py-4 mb-0">Nenhum cliente encontrado.</p> :
          <div className="table-responsive"><Table className="table-nowrap mb-0" hover>
            <thead className="table-light"><tr><th>Cliente</th><th>Documento</th><th>Escritórios</th><th>Documentação</th><th>Situação</th><th className="text-end">Ações</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>
              <td>{row.name}</td><td>{row.maskedDocumentNumber ?? "—"}</td>
              <td>{row.officeIds.map((id) => officeNames.get(id) ?? "Escritório").join(", ") || "—"}</td>
              <td>{(() => {
                const alert = documentationAlert(row.documentation);
                if (!alert) return "—";
                const badge = <Badge color={alert.color}><i className={`${alert.icon} me-1`} />{alert.text}</Badge>;
                // Parecer aguardando: o selo abre a ficha na etapa Validacao, onde a pessoa confirma.
                return alertOpensValidation(row.documentation) ? (
                  <button type="button" className="btn btn-link p-0 border-0 align-baseline" title="Abrir a validação para conferir e confirmar"
                    onClick={() => void openEdit(row, "validation")}>{badge}</button>
                ) : badge;
              })()}</td>
              <td><Badge color={row.status === "active" ? "success" : "secondary"}>{row.status === "active" ? "Ativo" : "Inativo"}</Badge></td>
              <td className="text-end"><Button size="sm" outline color="success" className="me-1" title={validationConfigured ? "Enviar documentos para validação" : "Agente de validação não configurado"} disabled={validatingId !== null || !canValidateFromList(row.documentation, validationConfigured)} onClick={() => void validateFromList(row)}>{validatingId === row.id ? <Spinner size="sm" /> : <><i className="ri-robot-2-line me-1" />Validar</>}</Button><Button size="sm" outline color="secondary" className="me-1" onClick={() => void showCards(row)}>Cards</Button><Button size="sm" outline color="primary" onClick={() => void openEdit(row)}>Editar</Button></td>
            </tr>)}</tbody>
          </Table></div>}
        <div className="d-flex justify-content-between align-items-center mt-3">
          <small className="text-muted">{total} cliente(s)</small>
          <div><Button size="sm" outline disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><span className="mx-2 small">{page} / {pages}</span><Button size="sm" outline disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Próxima</Button></div>
        </div>
      </CardBody>
    </Card>

    <Modal isOpen={modalOpen} toggle={() => !saving && setModalOpen(false)} centered size="xl">
      <Form onSubmit={(event) => void submit(event)}>
        <ModalHeader toggle={() => !saving && setModalOpen(false)}>{editing ? "Editar cliente" : "Novo cliente"}</ModalHeader>
        <ModalBody><Row>
          <Col md={3}><div className="nav flex-column nav-pills">{STEPS.map((item) => <button key={item.id} type="button" className={`nav-link text-start ${step === item.id ? "active" : ""}`} onClick={() => setStep(item.id)}><i className={`${item.icon} me-2`} />{item.label}</button>)}</div></Col>
          <Col md={9}>{formError && <Alert color="danger">{formError}</Alert>}
            {step === "general" && <GeneralFields form={form} setForm={setForm} cpfLocked={Boolean(editing?.maskedDocumentNumber)} />}
            {step === "legal" && <LegalFields form={form} setForm={setForm} />}
            {step === "lawsuits" && <CustomerPriorLawsuitsStep customerId={editing?.id ?? null} />}
            {step === "offices" && (canChooseOffices
              ? <OfficeFields form={form} setForm={setForm} offices={offices} />
              : <OfficeReadOnly editing={Boolean(editing)} officeIds={form.officeIds} offices={offices} myOffice={myOffice} />)}
            {step === "validation" && (
              <CustomerValidationStep
                customerId={editing?.id ?? null}
                onDataApplied={mergeAppliedFields}
                reloadKey={liveCustomer && liveCustomer.customerId === editing?.id ? liveCustomer.seq : 0}
              />
            )}
            {step === "documents" && <CustomerDocumentsStep customerId={editing?.id ?? null} staged={stagedDocuments} onStagedChange={setStagedDocuments} notice={documentsNotice} />}
          </Col>
        </Row></ModalBody>
        <ModalFooter><Button type="button" color="light" disabled={saving} onClick={() => setModalOpen(false)}>Cancelar</Button><Button color="primary" type="submit" disabled={saving}>{saving && <Spinner size="sm" className="me-1" />}Salvar</Button></ModalFooter>
      </Form>
    </Modal>

    <Modal isOpen={Boolean(cardsCustomer)} toggle={() => setCardsCustomer(null)} centered size="lg">
      <ModalHeader toggle={() => setCardsCustomer(null)}>Cards de {cardsCustomer?.name}</ModalHeader>
      <ModalBody>{cardsLoading ? <div className="text-center"><Spinner /></div> : <>
        {cardError && <Alert color="danger">{cardError}</Alert>}
        <Form onSubmit={(event) => void createCard(event)} className="border rounded p-3 mb-3">
          <Section icon="ri-layout-grid-line" title="Criar card" /><Row>
            <Field col={6} label="Quadro *"><Input type="select" value={cardForm.boardId} onChange={(event) => void selectBoard(event.target.value)}><option value="">Selecione</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</Input></Field>
            <Field col={6} label="Coluna *"><Input type="select" value={cardForm.columnId} onChange={(event) => setCardForm((value) => ({ ...value, columnId: event.target.value }))}><option value="">Selecione</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</Input></Field>
            <Field col={6} label="Escritório *"><Input type="select" value={cardForm.officeId} onChange={(event) => setCardForm((value) => ({ ...value, officeId: event.target.value }))}><option value="">Selecione</option>{cardsCustomer?.officeIds.map((id) => <option key={id} value={id}>{officeNames.get(id) ?? "Escritório"}</option>)}</Input></Field>
            <Field col={6} label="Título *"><Input value={cardForm.title} maxLength={200} onChange={(event) => setCardForm((value) => ({ ...value, title: event.target.value }))} /></Field>
          </Row><div className="text-end"><Button color="primary" size="sm" disabled={cardSaving}>{cardSaving && <Spinner size="sm" className="me-1" />}Criar card</Button></div>
        </Form>
        {cards.length === 0 ? <p className="text-muted mb-0">Nenhum card visível vinculado.</p> : <div className="table-responsive"><Table hover><thead className="table-light"><tr><th>Card</th><th>Situação</th></tr></thead><tbody>{cards.map((card) => <tr key={card.id}><td>{card.title}</td><td>{card.status}</td></tr>)}</tbody></Table></div>}
      </>}</ModalBody>
    </Modal>
  </>;
}

function GeneralFields({ form, setForm, cpfLocked }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; cpfLocked: boolean }) {
  return <><Section icon="ri-file-text-line" title="Dados gerais" /><Row>
    <Field col={8} label="Nome *"><Input value={form.name} maxLength={160} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} /></Field>
    <Field col={4} label={cpfLocked ? "CPF (não exibido)" : "CPF *"}><Input value={form.documentNumber} disabled={cpfLocked} maxLength={14} onChange={(e) => setForm((v) => ({ ...v, documentNumber: e.target.value }))} /></Field>
    <Field col={6} label="E-mail"><Input type="email" value={form.email} maxLength={180} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} /></Field>
    <Field col={6} label="Telefone"><Input value={form.phone} maxLength={40} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} /></Field>
  </Row></>;
}

function LegalFields({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  const inputs: Array<[keyof FormState, string, number]> = [["dataNascimento", "Data de nascimento", 4], ["nacionalidade", "Nacionalidade", 4], ["estadoCivil", "Estado civil", 4], ["profissao", "Profissão", 6], ["rgNumero", "RG", 3], ["rgUf", "UF", 3], ["nomeMae", "Nome da mãe", 12], ["numeroBeneficio", "Número do benefício", 6], ["especieBeneficio", "Espécie do benefício", 6], ["bancoPagamento", "Banco de pagamento", 12]];
  return <><Section icon="ri-file-list-3-line" title="Dados jurídicos" /><Row>{inputs.map(([key, label, col]) => <Field key={key} col={col} label={label}><Input value={String(form[key])} maxLength={key === "rgUf" ? 2 : key === "dataNascimento" ? 10 : 200} placeholder={key === "dataNascimento" ? "DD/MM/AAAA" : undefined} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))} /></Field>)}<Field col={12} label="Observações"><Input type="textarea" rows={3} value={form.observacoes} maxLength={2000} onChange={(e) => setForm((v) => ({ ...v, observacoes: e.target.value }))} /></Field><Col md={12}><FormGroup check><Input type="checkbox" checked={form.hipossuficienciaDeclarada} onChange={(e) => setForm((v) => ({ ...v, hipossuficienciaDeclarada: e.target.checked }))} /><Label check>Hipossuficiência declarada</Label></FormGroup></Col></Row></>;
}

function OfficeFields({ form, setForm, offices }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; offices: OfficeDto[] }) {
  return <><Section icon="ri-building-line" title="Escritórios *" />{offices.length === 0 ? <Alert color="warning">Nenhum escritório ativo disponível.</Alert> : offices.map((office) => <FormGroup check key={office.id} className="mb-2"><Input type="checkbox" checked={form.officeIds.includes(office.id)} onChange={(e) => setForm((v) => ({ ...v, officeIds: e.target.checked ? [...v.officeIds, office.id] : v.officeIds.filter((id) => id !== office.id) }))} /><Label check>{office.name}</Label></FormGroup>)}</>;
}

/** Sem permissao de escolher: mostra onde o cliente fica (novo: escritorio ativo de quem cadastra). */
function OfficeReadOnly({ editing, officeIds, offices, myOffice }: { editing: boolean; officeIds: string[]; offices: OfficeDto[]; myOffice: ActiveOfficeStateDto | null }) {
  const names = new Map([...offices.map((office) => [office.id, office.name] as const), ...(myOffice?.offices ?? []).map((office) => [office.id, office.name] as const)]);
  const active = myOffice?.activeOfficeId ? names.get(myOffice.activeOfficeId) : null;
  return <><Section icon="ri-building-line" title="Escritório" />
    {editing
      ? <p className="mb-1">{officeIds.map((id) => names.get(id) ?? "Escritório").join(", ") || "—"}</p>
      : active
        ? <p className="mb-1">O cliente será cadastrado no seu escritório ativo: <strong>{active}</strong>.</p>
        : <Alert color="warning">Seu usuário não está em um escritório ativo. Fale com o administrador.</Alert>}
    <div className="form-text">Só o administrador (ou quem tem a permissão de escolher o escritório) altera o escritório do cliente.</div></>;
}

function Field({ col, label, children }: { col: number; label: string; children: React.ReactNode }) { return <Col md={col}><FormGroup><Label>{label}</Label>{children}</FormGroup></Col>; }
function Section({ icon, title }: { icon: string; title: string }) { return <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-3"><i className={`${icon} me-1`} />{title}</p>; }
function nullable(value: string): string | null { const trimmed = value.trim(); return trimmed || null; }
function sameIds(left: string[], right: string[]) { return left.length === right.length && [...left].sort().every((id, index) => id === [...right].sort()[index]); }
