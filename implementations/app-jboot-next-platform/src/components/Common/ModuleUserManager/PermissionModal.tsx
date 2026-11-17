"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, Col, Form, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner } from "reactstrap";
import { ManagedUser, ModulePermissionCatalog, replaceManagedUserPermissions } from "@/lib/identity-manager-api";

interface Props {
  catalog: ModulePermissionCatalog;
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PermissionModal({ catalog, user, onClose, onSaved }: Props) {
  const [scopes, setScopes] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const editableScopes = new Set(catalog.scopes.map(item => item.key));
    const editableRoles = new Set(catalog.roles.map(item => item.key));
    setScopes((user?.scopes ?? []).filter(scope => editableScopes.has(scope)));
    setRoles((user?.roles ?? []).filter(role => editableRoles.has(role)));
    setError(null);
  }, [catalog, user]);

  function toggle(values: string[], value: string, checked: boolean, setValues: (next: string[]) => void) {
    setValues(checked ? [...new Set([...values, value])] : values.filter(item => item !== value));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await replaceManagedUserPermissions(user.identityId, { scopes, roles });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao salvar permissões");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={Boolean(user)} toggle={onClose} centered size="xl">
      <Form onSubmit={submit}>
        <ModalHeader toggle={onClose}>Permissões de {user?.displayName}</ModalHeader>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <Row className="g-4">
            <Col xs={12} lg={3}>
              <div className="nav flex-lg-column nav-pills gap-2">
                <button type="button" className="nav-link text-start active">
                  <i className="ri-shield-user-line me-2" />Acesso
                </button>
              </div>
            </Col>
            <Col xs={12} lg={9}>
              <h6 className="text-uppercase border-bottom pb-2 mb-3">Escopos do módulo</h6>
              <Row>
                {catalog.scopes.map(item => (
                  <Col md={6} key={item.key}>
                    <FormGroup check className="mb-2">
                      <Input type="checkbox" checked={scopes.includes(item.key)} onChange={event => toggle(scopes, item.key, event.target.checked, setScopes)} />
                      <Label check>{item.label}</Label>
                    </FormGroup>
                  </Col>
                ))}
              </Row>
              <h6 className="text-uppercase border-bottom pb-2 mt-4 mb-3">Papéis do módulo</h6>
              <Row>
                {catalog.roles.map(item => (
                  <Col md={6} key={item.key}>
                    <FormGroup check className="mb-2">
                      <Input type="checkbox" checked={roles.includes(item.key)} onChange={event => toggle(roles, item.key, event.target.checked, setRoles)} />
                      <Label check>{item.label}</Label>
                    </FormGroup>
                  </Col>
                ))}
              </Row>
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button color="primary" type="submit" disabled={saving}>
            {saving ? <><Spinner size="sm" className="me-1" />Salvando</> : "Salvar"}
          </Button>
        </ModalFooter>
      </Form>
    </Modal>
  );
}
