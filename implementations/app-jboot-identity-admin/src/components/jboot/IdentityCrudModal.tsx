"use client";

import React from "react";
import { Button, Col, Form, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner } from "reactstrap";

interface IdentityCrudModalProps {
  isOpen: boolean;
  title: string;
  saving: boolean;
  canSave: boolean;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  children: React.ReactNode;
}

export function IdentityCrudModal({
  isOpen,
  title,
  saving,
  canSave,
  onClose,
  onSubmit,
  children,
}: IdentityCrudModalProps) {
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered size="xl">
      <Form onSubmit={submit}>
        <ModalHeader toggle={onClose}>{title}</ModalHeader>
        <ModalBody>
          <Row className="g-4">
            <Col xs={12} lg={3}>
              <div className="nav flex-lg-column nav-pills gap-2">
                <button type="button" className="nav-link text-start active">
                  <i className="ri-file-list-3-line me-2 align-bottom" />
                  Dados
                </button>
              </div>
            </Col>
            <Col xs={12} lg={9}>
              {children}
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="light" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={saving || !canSave}>
            {saving ? <><Spinner size="sm" className="me-1" />Salvando</> : "Salvar"}
          </Button>
        </ModalFooter>
      </Form>
    </Modal>
  );
}
