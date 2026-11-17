import React from "react";

/**
 * Selo "ASSINATURA PENDENTE" do tile (docs/product/flow-signed-kit-sprints.md, S2): o cliente ja tem kit e o
 * assinado ainda nao foi aprovado, num quadro com coluna que exige o kit assinado. Calculado no backend.
 */
export default function SignedKitPendingBadge({ pending }: { pending: boolean | undefined }) {
  if (!pending) {
    return null;
  }
  return (
    <span
      className="badge bg-warning-subtle text-warning"
      title="Kit sem assinatura aprovada: o card não entra nas colunas que exigem o kit assinado. Envie no bloco Documentos do card."
    >
      <i className="ri-quill-pen-line me-1" />
      ASSINATURA PENDENTE
    </span>
  );
}
