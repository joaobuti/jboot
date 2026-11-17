"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Input, Spinner, Table } from "reactstrap";
import {
  CustomerValidationRunDto,
  CustomerValidationStatusDto,
  KitGender,
  KitReviewDto,
  KitWaiverCourt,
  kanbanApi,
} from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";

const LOAN_TAG = /^(BANCO|CONTRATO|INICIO|VALOR|PARCELAS)_(\d+)$/;

export interface KitReviewRow {
  tag: string;
  value: string;
  /** Valor sugerido pela IA, para mostrar quando a pessoa alterou. */
  suggested: string;
}

/**
 * Linhas da revisao: tags do modelo na ordem do modelo e, em seguida, os emprestimos alem
 * da linha-molde (`BANCO_3`...) que a IA devolveu. Valor revisado prevalece sobre o sugerido.
 */
export function kitReviewRows(modelTags: readonly string[], run: Pick<CustomerValidationRunDto, "tagValues" | "review">): KitReviewRow[] {
  const suggested = run.tagValues ?? {};
  const reviewed = run.review?.values;
  const extra = [...new Set([...Object.keys(suggested), ...Object.keys(reviewed ?? {})])]
    .filter((tag) => !modelTags.includes(tag) && LOAN_TAG.test(tag))
    .sort((a, b) => {
      const [, pa, na] = LOAN_TAG.exec(a)!;
      const [, pb, nb] = LOAN_TAG.exec(b)!;
      return Number(na) - Number(nb) || LOAN_PART_ORDER.indexOf(pa) - LOAN_PART_ORDER.indexOf(pb);
    });
  return [...modelTags, ...extra].map((tag) => ({
    tag,
    value: reviewed ? reviewed[tag] ?? "" : suggested[tag] ?? "",
    suggested: suggested[tag] ?? "",
  }));
}

const LOAN_PART_ORDER = ["BANCO", "CONTRATO", "INICIO", "VALOR", "PARCELAS"];

export interface KitLoanRow {
  n: number;
  cells: Partial<Record<string, KitReviewRow>>;
}

/** Separa os campos do cliente dos contratos (uma linha por `_n`, uma coluna por parte). */
export function groupKitRows(rows: readonly KitReviewRow[]): { fields: KitReviewRow[]; loanParts: string[]; loans: KitLoanRow[] } {
  const fields: KitReviewRow[] = [];
  const byNumber = new Map<number, KitLoanRow>();
  const parts = new Set<string>();
  for (const row of rows) {
    const loan = LOAN_TAG.exec(row.tag);
    if (!loan) {
      fields.push(row);
      continue;
    }
    const n = Number(loan[2]);
    parts.add(loan[1]);
    const entry = byNumber.get(n) ?? { n, cells: {} };
    entry.cells[loan[1]] = row;
    byNumber.set(n, entry);
  }
  return {
    fields,
    loanParts: LOAN_PART_ORDER.filter((part) => parts.has(part)),
    loans: [...byNumber.values()].sort((a, b) => a.n - b.n),
  };
}

const LOAN_PART_LABEL: Record<string, string> = {
  BANCO: "Banco",
  CONTRATO: "Contrato",
  INICIO: "Início",
  VALOR: "Valor",
  PARCELAS: "Parcelas",
};

export function missingKitTags(rows: readonly KitReviewRow[]): string[] {
  return rows.filter((row) => row.value.trim() === "").map((row) => row.tag);
}

interface Props {
  customerId: string;
  run: CustomerValidationRunDto;
  kitModel: NonNullable<CustomerValidationStatusDto["kitModel"]>;
  canApprove: boolean;
  onSaved: (status: CustomerValidationStatusDto) => void;
}

/**
 * Revisao humana dos valores do kit (ADR 019): fronteira entre a IA e o documento juridico.
 * O Flow gera o kit com estes valores na confirmacao (ADR 019, decisao 19); campo sem valor fica
 * `[[CAMPO]]` no arquivo para o advogado corrigir. Depois da confirmacao os valores ficam so para consulta.
 */
export default function KitReviewPanel({ customerId, run, kitModel, canApprove, onSaved }: Props) {
  const initial = useMemo(() => kitReviewRows(kitModel.tags, run), [kitModel.tags, run]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [gender, setGender] = useState<KitGender | "">("");
  const [waiverCourt, setWaiverCourt] = useState<KitWaiverCourt | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValues(Object.fromEntries(initial.map((row) => [row.tag, row.value])));
    setGender(run.review?.gender ?? run.gender ?? "");
    setWaiverCourt(run.review?.waiverCourt ?? run.waiverCourt ?? "");
  }, [initial, run]);

  const rows = initial.map((row) => ({ ...row, value: values[row.tag] ?? "" }));
  const grouped = groupKitRows(rows);
  // Celula de contrato sem linha na sugestao (ex.: PARCELAS_3 omitida) tambem conta como falta.
  const missing = [
    ...missingKitTags(rows),
    ...grouped.loans.flatMap((loan) =>
      grouped.loanParts.filter((part) => !loan.cells[part] && !(values[`${part}_${loan.n}`] ?? "").trim()).map((part) => `${part}_${loan.n}`),
    ),
  ];
  const setValue = (tag: string, value: string) => setValues((prev) => ({ ...prev, [tag]: value }));

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const review: KitReviewDto = {
      // Mapa completo: inclui celula de contrato vazia na sugestao e preenchida na revisao.
      values: Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== "").map(([tag, value]) => [tag, value.trim()])),
      gender: gender || null,
      waiverCourt: waiverCourt || null,
    };
    try {
      onSaved(await kanbanApi.customerValidation.saveKitReview(customerId, run.id, review));
      setSaved(true);
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao salvar a revisão"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded p-3 mb-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <span className="small fw-semibold">
          <i className="ri-file-edit-line me-1" />Valores do kit
          {kitModel.officeName ? ` — modelo de ${kitModel.officeName}` : ""} (versão {kitModel.version})
        </span>
        {missing.length > 0 ? (
          <Badge color="warning">{missing.length} sem valor</Badge>
        ) : (
          <Badge color="success">Todos preenchidos</Badge>
        )}
      </div>
      <p className="small text-muted">
        {run.confirmedAt
          ? "Valores usados no kit gerado na confirmação."
          : "Sugeridos pela IA a partir dos documentos. Confira e corrija antes de confirmar: o kit é gerado na confirmação com estes valores e o texto fixo do modelo não muda."}
        {run.reviewedAt ? " Revisão salva." : ""}
      </p>
      {error && <Alert color="danger" className="small" toggle={() => setError(null)}>{error}</Alert>}
      {saved && <Alert color="success" className="small" toggle={() => setSaved(false)}>Revisão salva.</Alert>}
      <div className="row g-2 mb-2">
        <div className="col-sm-6">
          <label className="form-label small mb-1" htmlFor="kit-gender">Gênero do cliente (concordância do kit)</label>
          <Input id="kit-gender" type="select" bsSize="sm" value={gender} disabled={!canApprove || saving}
            onChange={(event) => setGender(event.target.value as KitGender | "")}>
            <option value="">Não informado</option>
            <option value="feminino">Feminino</option>
            <option value="masculino">Masculino</option>
          </Input>
        </div>
        <div className="col-sm-6">
          <label className="form-label small mb-1" htmlFor="kit-waiver">Termo de Renúncia</label>
          <Input id="kit-waiver" type="select" bsSize="sm" value={waiverCourt} disabled={!canApprove || saving}
            onChange={(event) => setWaiverCourt(event.target.value as KitWaiverCourt | "")}>
            <option value="">Não informado</option>
            <option value="jec">Juizado Especial Cível (até 40 salários mínimos)</option>
            <option value="jef">Juizado Especial Federal, com o INSS (até 60 salários mínimos)</option>
          </Input>
        </div>
      </div>
      <div className="table-responsive">
        <Table size="sm" className="align-middle mb-2">
          <tbody>
            {grouped.fields.map((row) => (
              <tr key={row.tag}>
                <td className="small text-nowrap"><code>{`[[${row.tag}]]`}</code></td>
                <td>
                  <Input bsSize="sm" value={row.value} maxLength={500} disabled={!canApprove || saving}
                    invalid={row.value.trim() === ""} aria-label={row.tag}
                    onChange={(event) => setValue(row.tag, event.target.value)} />
                  {row.suggested && row.value.trim() !== row.suggested && (
                    <div className="small text-muted mt-1">Sugerido pela IA: {row.suggested}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      {grouped.loans.length > 0 && (
        <>
          <p className="small fw-semibold mb-1">Contratos ({grouped.loans.length})</p>
          <div className="table-responsive mb-2" style={{ maxHeight: 420, overflowY: "auto" }}>
            <Table size="sm" className="align-middle mb-0">
              <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  <th className="small">#</th>
                  {grouped.loanParts.map((part) => <th key={part} className="small">{LOAN_PART_LABEL[part] ?? part}</th>)}
                </tr>
              </thead>
              <tbody>
                {grouped.loans.map((loan) => (
                  <tr key={loan.n}>
                    <td className="small text-muted">{loan.n}</td>
                    {grouped.loanParts.map((part) => {
                      const tag = `${part}_${loan.n}`;
                      const cell = loan.cells[part];
                      const value = cell?.value ?? values[tag] ?? "";
                      return (
                        <td key={part} style={{ minWidth: part === "BANCO" ? 220 : 130 }}>
                          <Input bsSize="sm" value={value} maxLength={500} disabled={!canApprove || saving}
                            invalid={value.trim() === ""} aria-label={tag} title={cell?.suggested ? `Sugerido pela IA: ${cell.suggested}` : undefined}
                            onChange={(event) => setValue(tag, event.target.value)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
      {canApprove ? (
        <div className="d-flex justify-content-end">
          <Button color="primary" size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? <Spinner size="sm" className="me-1" /> : <i className="ri-save-line me-1" />}Salvar revisão
          </Button>
        </div>
      ) : (
        <p className="small text-muted mb-0"><i className="ri-lock-line me-1" />Só quem tem a permissão de aprovar o parecer revisa os valores.</p>
      )}
    </div>
  );
}
