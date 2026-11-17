"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, FormGroup, Input, Label, Spinner } from "reactstrap";
import { describeKanbanError } from "@/modules/kanban/lib/card-documents";
import { OfficeKitEmailSettingsDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";

/**
 * Envio do kit ao cliente por e-mail (docs/product/flow-signed-kit-sprints.md, S4), por escritorio: liga/desliga,
 * assunto e texto. O kit vai anexo quando e gerado e o cliente tem e-mail na ficha; o download no card continua.
 */
export default function OfficeKitEmailSettings({ officeId }: { officeId: string }) {
  const [draft, setDraft] = useState<OfficeKitEmailSettingsDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      setDraft(await kanbanApi.offices.kitEmail(officeId));
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao carregar o envio do kit"));
    }
  }, [officeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      setDraft(await kanbanApi.offices.saveKitEmail(officeId, { enabled: draft.enabled, subject: draft.subject, body: draft.body }));
      setNotice(draft.enabled ? "Envio ligado: os próximos kits gerados vão por e-mail ao cliente." : "Envio desligado: o kit fica só para baixar no card.");
    } catch (err) {
      setError(describeKanbanError(err, "Erro ao salvar o envio do kit"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-3">
      <CardHeader>
        <h5 className="mb-0">
          <i className="ri-mail-send-line me-2" />
          Envio do kit ao cliente
        </h5>
      </CardHeader>
      <CardBody>
        {error && <Alert color="danger" toggle={() => setError(null)}>{error}</Alert>}
        {notice && <Alert color="success" toggle={() => setNotice(null)}>{notice}</Alert>}
        {!draft ? (
          <div className="text-center py-2"><Spinner size="sm" /></div>
        ) : (
          <>
            <p className="small text-muted">
              Quando o kit é gerado e o cliente tem e-mail na ficha, o Flow envia o kit anexo com este texto. Sem e-mail, o
              kit fica só para baixar no card. Use [[NOME]] para o nome do cliente e [[ESCRITORIO]] para o nome do escritório.
            </p>
            <FormGroup switch className="mb-3">
              <Input
                id={`kit-email-enabled-${officeId}`}
                type="switch"
                checked={draft.enabled}
                disabled={saving}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              />
              <Label for={`kit-email-enabled-${officeId}`} check>Enviar o kit ao cliente por e-mail</Label>
            </FormGroup>
            <Label for={`kit-email-subject-${officeId}`}>Assunto *</Label>
            <Input
              id={`kit-email-subject-${officeId}`}
              className="mb-3"
              maxLength={200}
              value={draft.subject}
              disabled={saving}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
            />
            <Label for={`kit-email-body-${officeId}`}>Texto *</Label>
            <Input
              id={`kit-email-body-${officeId}`}
              type="textarea"
              rows={6}
              maxLength={4000}
              value={draft.body}
              disabled={saving}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
            <div className="d-flex justify-content-end mt-3">
              <Button color="primary" onClick={() => void save()} disabled={saving || !draft.subject.trim() || !draft.body.trim()}>
                {saving ? <Spinner size="sm" className="me-1" /> : <i className="ri-save-line me-1" />}
                Salvar
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
