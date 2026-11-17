import React from "react";

/**
 * Selo "SEM HISCON" do tile e do painel Cliente (docs/product/flow-customer-promobank-sprints.md): cliente
 * validado sem HISCON num quadro com coluna que exige o HISCON (regra "Exigir para entrar", S1 de
 * flow-signed-kit-sprints.md). Calculado no backend; some sozinho quando o HISCON e enviado.
 */
export default function MissingHisconBadge({ missing }: { missing: boolean | undefined }) {
  if (!missing) {
    return null;
  }
  return (
    <span
      className="badge bg-danger-subtle text-danger"
      title="Cliente sem HISCON: o card não entra nas colunas que exigem o HISCON. Envie no painel Cliente do card."
    >
      <i className="ri-file-warning-line me-1" />
      SEM HISCON
    </span>
  );
}
