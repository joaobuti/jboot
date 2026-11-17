"use client";

interface LockedSourceSignalProps {
  label: string;
  /** Motivo exibido ao passar o mouse (capacidade nao contratada). */
  reason: string;
}

/**
 * Sinalizador de fonte do cabecalho do card quando o cliente nao contratou a capacidade: continua
 * visivel (o usuario sabe que a fonte existe), mas apagado e sem acao. O `title` fica no envoltorio
 * porque botao desabilitado nao recebe eventos de mouse em todos os navegadores.
 */
export default function LockedSourceSignal({ label, reason }: LockedSourceSignalProps) {
  return (
    <span className="d-flex align-items-center gap-1" title={reason} style={{ cursor: "not-allowed", opacity: 0.55 }}>
      <span className="small text-muted fw-semibold">{label}</span>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={reason}
        className="d-flex align-items-center justify-content-center rounded-circle border-0 p-0 bg-light text-muted"
        style={{ width: 24, height: 24, fontSize: 12, pointerEvents: "none" }}
      >
        <i className="ri-lock-line" />
      </button>
    </span>
  );
}
