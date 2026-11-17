import React from "react";
import { Button, Modal, ModalBody, Spinner } from "reactstrap";

interface ConfirmActionModalProps {
  isOpen: boolean;
  title: string;
  /** Contexto da decisao: o que acontece ao confirmar. */
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** primary, success, warning, danger... */
  color?: string;
  icon?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmacao de acao no padrao do template (derivado de `DeleteModal`, Velzon): modal
 * centralizado, icone, titulo, contexto e botoes Cancelar/Confirmar. Substitui `window.confirm`,
 * que foge do visual da plataforma, nao mostra contexto e pode ser bloqueado pelo navegador.
 */
const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancelar",
  color = "primary",
  icon = "ri-question-line",
  busy = false,
  onConfirm,
  onCancel,
}) => (
  <Modal fade isOpen={isOpen} toggle={busy ? undefined : onCancel} centered>
    <ModalBody className="py-3 px-4 px-sm-5">
      <div className="mt-2 text-center">
        <i className={`${icon} display-5 text-${color}`} />
        <div className="mt-3 pt-2 fs-15">
          <h4 className="mb-2">{title}</h4>
          {children && <div className="text-muted text-start">{children}</div>}
        </div>
      </div>
      <div className="d-flex gap-2 justify-content-center mt-4 mb-2">
        <Button type="button" color="light" className="w-sm material-shadow-none" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button type="button" color={color} className="w-sm material-shadow-none" onClick={onConfirm} disabled={busy}>
          {busy && <Spinner size="sm" className="me-1" />}
          {confirmLabel}
        </Button>
      </div>
    </ModalBody>
  </Modal>
);

export default ConfirmActionModal;
