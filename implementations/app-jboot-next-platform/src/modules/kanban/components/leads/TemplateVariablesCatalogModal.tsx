"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table } from "reactstrap";
import { kanbanApi, TemplateCatalogDto, TemplateCatalogVariableDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";

interface TemplateVariablesCatalogModalProps {
  isOpen: boolean;
  toggle: () => void;
}

function exampleText(variable: TemplateCatalogVariableDto): string {
  if (variable.valueType === "boolean") {
    return "bloco aparece se sim";
  }
  if (variable.valueType === "collection") {
    return (variable.items ?? []).map((item) => `${item.key}: ${item.example ?? "-"}`).join(" · ");
  }
  return variable.example === null || variable.example === undefined ? "-" : String(variable.example);
}

/**
 * Catalogo de variaveis para montar o modelo no Word (CRM de leads, Sprint 5).
 * Somente leitura; os exemplos sao dados sinteticos do catalogo (nunca de cliente).
 */
export default function TemplateVariablesCatalogModal({ isOpen, toggle }: TemplateVariablesCatalogModalProps) {
  const [catalog, setCatalog] = useState<TemplateCatalogDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || catalog) {
      return;
    }
    let active = true;
    kanbanApi.documentTemplates
      .catalog()
      .then((result) => {
        if (active) {
          setCatalog(result);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(describeKanbanError(err, "Erro ao carregar o catálogo de variáveis"));
        }
      });
    return () => {
      active = false;
    };
  }, [isOpen, catalog]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Modal isOpen={isOpen} toggle={toggle} centered size="xl" scrollable>
      <ModalHeader toggle={toggle}>Variáveis disponíveis</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}
        {!catalog && !error && (
          <div className="text-center py-4">
            <Spinner color="primary" />
          </div>
        )}
        {catalog && (
          <>
            <Alert color="info" className="small mb-3">
              Escreva no Word exatamente como na coluna &quot;Usar no modelo&quot;, com chaves duplas. Não há filtros nem
              cálculos: a formatação (CPF com máscara, datas) já vem pronta. Não use {"{{@...}}"}. Envie em .docx, até 10
              MB. Catálogo versão {catalog.catalogVersion}.
            </Alert>
            {catalog.namespaces.map((namespace) => (
              <div key={namespace.key} className="mb-4">
                <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">
                  {namespace.label}
                  <span className="fw-normal text-lowercase ms-2">{namespace.description}</span>
                </p>
                <div className="table-responsive">
                  <Table className="table-sm align-middle mb-0" hover>
                    <thead className="table-light">
                      <tr>
                        <th>Usar no modelo</th>
                        <th>Descrição</th>
                        <th>Exemplo (fictício)</th>
                        <th className="text-end">Copiar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {namespace.variables.map((variable) => (
                        <tr key={variable.key}>
                          <td>
                            <code>{variable.usage}</code>
                          </td>
                          <td>
                            <div>{variable.label}</div>
                            <div className="text-muted small">{variable.description}</div>
                          </td>
                          <td className="small">{exampleText(variable)}</td>
                          <td className="text-end">
                            <Button
                              size="sm"
                              color="light"
                              title="Copiar"
                              aria-label={`Copiar ${variable.usage}`}
                              onClick={() => void copy(variable.usage)}
                            >
                              <i className={copied === variable.usage ? "ri-check-line" : "ri-file-copy-line"} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            ))}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="light" onClick={toggle}>
          Fechar
        </Button>
      </ModalFooter>
    </Modal>
  );
}
