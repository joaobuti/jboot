"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, Col, Form, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner } from "reactstrap";
import { kanbanApi, UserOabDto } from "@/modules/kanban/lib/kanban-api";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { UF_OPTIONS } from "@/modules/kanban/lib/ufs";

interface FlowUserLawyerModalProps {
  user: { identityId: string; displayName: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

export interface UserLawyerForm {
  signatureName: string;
  oabs: UserOabDto[];
}

/** Mesmas regras do BFF: OAB ate 7 digitos (letra final na suplementar), uma por UF, nome com OAB. */
export function userLawyerFormError(form: UserLawyerForm): string | null {
  const seen = new Set<string>();
  for (const oab of form.oabs) {
    if (!oab.uf) return "Selecione a UF de cada OAB.";
    if (!/^[0-9]{1,7}(-?[A-Z])?$/.test(oab.number.toUpperCase().replace(/[.\s]/g, ""))) {
      return `OAB/${oab.uf} invalida: ate 7 digitos e, na inscricao suplementar, a letra final.`;
    }
    if (seen.has(oab.uf)) return `Mais de uma OAB na UF ${oab.uf}.`;
    seen.add(oab.uf);
  }
  if (form.oabs.length > 0 && !form.signatureName.trim()) return "Informe o nome para assinatura.";
  return null;
}

/**
 * Advogado no cadastro do usuario do Flow (S7 de docs/product/flow-initial-petitions-sprints.md): nome
 * como sai na assinatura e uma OAB por UF (principal e suplementares). Quem assina a peticao e o
 * responsavel do card com OAB na UF da acao. Sem OAB, o usuario nao assina. So `flow:admin`.
 */
export default function FlowUserLawyerModal({ user, onClose, onSaved }: FlowUserLawyerModalProps) {
  const [form, setForm] = useState<UserLawyerForm>({ signatureName: "", oabs: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setError(null);
    setLoading(true);
    kanbanApi.offices
      .userLawyer(user.identityId)
      .then((lawyer) => setForm({ signatureName: lawyer.signatureName ?? user.displayName, oabs: lawyer.oabs }))
      .catch((err) => setError(describeKanbanError(err, "Erro ao carregar o advogado")))
      .finally(() => setLoading(false));
  }, [user]);

  function updateOab(index: number, patch: Partial<UserOabDto>) {
    setForm((current) => ({ ...current, oabs: current.oabs.map((oab, i) => (i === index ? { ...oab, ...patch } : oab)) }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    const invalid = userLawyerFormError(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await kanbanApi.offices.replaceUserLawyer(user.identityId, form);
      onSaved();
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao salvar o advogado"));
    } finally {
      setSaving(false);
    }
  }

  const close = saving ? undefined : onClose;
  return (
    <Modal isOpen={user !== null} toggle={close} centered>
      <Form onSubmit={(event) => void submit(event)}>
        <ModalHeader toggle={close}>
          <i className="ri-scales-3-line me-1" />
          Advogado: {user?.displayName}
        </ModalHeader>
        <ModalBody>
          {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
          {loading ? (
            <div className="text-center py-3"><Spinner color="primary" /></div>
          ) : (
            <>
              <p className="text-muted small">
                Assina as petições iniciais dos cards em que é responsável, na UF em que tem OAB. Com mais de um
                responsável com OAB na UF, assina o responsável pelo escritório do card, depois o administrador do board.
              </p>
              <FormGroup>
                <Label for="lawyer-signature-name">Nome para assinatura</Label>
                <Input
                  id="lawyer-signature-name"
                  value={form.signatureName}
                  maxLength={200}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, signatureName: event.target.value }))}
                />
              </FormGroup>
              <p className="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">
                <i className="ri-bank-card-line me-1" />
                OABs
              </p>
              {form.oabs.length === 0 && <p className="text-muted small">Sem OAB: este usuário não assina petições.</p>}
              {form.oabs.map((oab, index) => (
                <Row key={index} className="g-2 align-items-end mb-2">
                  <Col xs={4}>
                    <Label for={`lawyer-oab-uf-${index}`} className="small mb-1">UF</Label>
                    <Input
                      id={`lawyer-oab-uf-${index}`}
                      type="select"
                      value={oab.uf}
                      disabled={saving}
                      onChange={(event) => updateOab(index, { uf: event.target.value })}
                    >
                      <option value="">Selecione</option>
                      {UF_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                    </Input>
                  </Col>
                  <Col xs={6}>
                    <Label for={`lawyer-oab-number-${index}`} className="small mb-1">Número</Label>
                    <Input
                      id={`lawyer-oab-number-${index}`}
                      value={oab.number}
                      maxLength={20}
                      placeholder="12345 ou 12345-A"
                      disabled={saving}
                      onChange={(event) => updateOab(index, { number: event.target.value })}
                    />
                  </Col>
                  <Col xs={2} className="text-end">
                    <Button
                      color="danger"
                      outline
                      size="sm"
                      title="Remover OAB"
                      disabled={saving}
                      onClick={() => setForm((current) => ({ ...current, oabs: current.oabs.filter((_, i) => i !== index) }))}
                    >
                      <i className="ri-delete-bin-line" />
                    </Button>
                  </Col>
                </Row>
              ))}
              <Button
                color="light"
                size="sm"
                disabled={saving || form.oabs.length >= UF_OPTIONS.length}
                onClick={() => setForm((current) => ({ ...current, oabs: [...current.oabs, { uf: "", number: "" }] }))}
              >
                <i className="ri-add-line me-1" />
                Adicionar OAB
              </Button>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="light" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={saving || loading}>
            {saving ? <Spinner size="sm" className="me-1" /> : null}
            Salvar
          </Button>
        </ModalFooter>
      </Form>
    </Modal>
  );
}
