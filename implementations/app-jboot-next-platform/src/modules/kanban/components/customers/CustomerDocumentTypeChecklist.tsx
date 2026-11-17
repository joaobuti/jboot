"use client";

import React from "react";
import { FormGroup, Input, Label } from "reactstrap";
import { CustomerDocumentType } from "@/modules/kanban/lib/kanban-api";
import { CUSTOMER_DOCUMENT_CATALOG } from "./CustomerDocumentsStep";

/** Liga/desliga um tipo mantendo a ordem do catalogo. */
export function toggleDocumentType(
  selected: readonly CustomerDocumentType[],
  type: CustomerDocumentType,
  checked: boolean,
): CustomerDocumentType[] {
  const next = new Set(selected);
  if (checked) next.add(type);
  else next.delete(type);
  return CUSTOMER_DOCUMENT_CATALOG.map((item) => item.type).filter((item) => next.has(item));
}

interface Props {
  idPrefix: string;
  selected: readonly CustomerDocumentType[];
  onChange: (value: CustomerDocumentType[]) => void;
  disabled?: boolean;
}

/**
 * Documentos do cliente que uma rotina Claude pode ler (ADR 019): so o que a etapa usa sai do
 * Flow. Mesmo padrao de switches do modal do cliente.
 */
export default function CustomerDocumentTypeChecklist({ idPrefix, selected, onChange, disabled }: Props) {
  return (
    <>
      {CUSTOMER_DOCUMENT_CATALOG.map((item) => (
        <FormGroup switch className="mb-1" key={item.type}>
          <Input
            id={`${idPrefix}-${item.type}`}
            type="switch"
            checked={selected.includes(item.type)}
            disabled={disabled}
            onChange={(event) => onChange(toggleDocumentType(selected, item.type, event.target.checked))}
          />
          <Label for={`${idPrefix}-${item.type}`} check>{item.label}</Label>
        </FormGroup>
      ))}
    </>
  );
}
