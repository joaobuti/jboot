"use client";

import React, { useState } from "react";
import { Badge, Button } from "reactstrap";
import type { CardCustomerDto, CardCustomerJuridicoDto } from "@/modules/kanban/lib/kanban-api";
import { formatCpf } from "@/modules/kanban/lib/cpf";
import { isoToBrDate } from "@/modules/kanban/lib/br-date";

const JURIDICO_LABELS: Array<[keyof CardCustomerJuridicoDto, string]> = [
  ["dataNascimento", "Nascimento"],
  ["nacionalidade", "Nacionalidade"],
  ["estadoCivil", "Estado civil"],
  ["profissao", "Profissao"],
  ["nomeMae", "Nome da mae"],
  ["rgNumero", "RG"],
  ["rgOrgaoEmissor", "Orgao emissor"],
  ["rgUf", "UF do RG"],
  ["numeroBeneficio", "Beneficio"],
  ["especieBeneficio", "Especie"],
  ["bancoPagamento", "Banco pagador"],
  ["observacoes", "Observacoes"],
];


function formatAddress(customer: CardCustomerDto): string | null {
  const street = [customer.addressStreet, customer.addressNumber].filter(Boolean).join(", ");
  const parts = [
    street,
    customer.addressComplement,
    customer.addressNeighborhood,
    [customer.addressCity, customer.addressState].filter(Boolean).join("/"),
    customer.addressZip,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" - ") : null;
}

interface CardCustomerSummaryProps {
  customer: CardCustomerDto;
  /** Abre os dados juridicos ja expandidos (ex.: confirmacao de vinculo). */
  juridicoExpanded?: boolean;
}

/** Leitura compacta do cliente final: dado geral sempre visivel, juridico recolhivel. */
export default function CardCustomerSummary({ customer, juridicoExpanded = false }: CardCustomerSummaryProps) {
  const [showJuridico, setShowJuridico] = useState(juridicoExpanded);
  const address = formatAddress(customer);
  const juridicoRows = customer.juridico
    ? JURIDICO_LABELS.filter(([field]) => {
        const value = customer.juridico?.[field];
        return value !== null && value !== undefined && value !== "" && field !== "hipossuficienciaDeclarada";
      })
    : [];

  return (
    <div>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className="fw-semibold">{customer.name}</span>
        {customer.status !== "active" && <Badge color="secondary">Inativo</Badge>}
        {customer.juridico?.hipossuficienciaDeclarada && <Badge color="soft-info">Hipossuficiencia declarada</Badge>}
      </div>
      <div className="small text-muted mt-1">
        {customer.documentNumber && <div>CPF {formatCpf(customer.documentNumber)}</div>}
        {customer.phone && <div>{customer.phone}</div>}
        {customer.email && <div>{customer.email}</div>}
        {address && <div>{address}</div>}
      </div>
      <Button
        color="link"
        size="sm"
        className="px-0 mt-1"
        onClick={() => setShowJuridico((value) => !value)}
        aria-expanded={showJuridico}
      >
        <i className={`${showJuridico ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} me-1`} />
        Dados juridicos
      </Button>
      {showJuridico &&
        (juridicoRows.length === 0 ? (
          <p className="small text-muted mb-0">Nenhum dado juridico preenchido.</p>
        ) : (
          <dl className="row small mb-0">
            {juridicoRows.map(([field, label]) => {
              const raw = String(customer.juridico?.[field] ?? "");
              return (
                <React.Fragment key={field}>
                  <dt className="col-5 text-muted fw-normal">{label}</dt>
                  <dd className="col-7 mb-1 text-break">{field === "dataNascimento" ? isoToBrDate(raw) : raw}</dd>
                </React.Fragment>
              );
            })}
          </dl>
        ))}
    </div>
  );
}
