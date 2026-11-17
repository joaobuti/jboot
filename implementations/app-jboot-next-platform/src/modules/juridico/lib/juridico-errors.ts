import { JuridicoApiError } from "./juridico-api";

export interface JuridicoErrorMessage {
  color: "warning" | "secondary" | "danger";
  message: string;
  requestId?: string;
}

/**
 * Traduz a falha para o advogado deixando claro **de quem é** o problema.
 *
 * As bases oficiais do CNJ saem do ar com alguma frequência — o DJEN responde
 * "o sistema está muito ocupado" sob carga. Sem distinguir isso de uma falha
 * nossa, a tela dizia algo genérico e o usuário concluía que o JBoot estava
 * quebrado, quando não havia nada a corrigir aqui nem nada a fazer além de
 * tentar de novo.
 */
export function describeJuridicoError(caught: unknown, fallback: string): JuridicoErrorMessage {
  const error = caught instanceof JuridicoApiError ? caught : null;
  if (!error) {
    return { color: "danger", message: caught instanceof Error ? caught.message : fallback };
  }

  const requestId = error.requestId;

  switch (error.code) {
    case "provider_unavailable":
    case "juridico_data_unavailable":
      return {
        color: "warning",
        requestId,
        message:
          "A base oficial de consulta do CNJ está indisponível no momento. Isso é uma instabilidade da fonte, não do sistema — tente novamente em alguns minutos.",
      };
    case "juridico_data_timeout":
      return {
        color: "warning",
        requestId,
        message: "A base oficial do CNJ demorou demais para responder. Tente novamente em alguns minutos.",
      };
    case "rate_limited":
      return {
        color: "warning",
        requestId,
        message: "Limite de consultas da fonte oficial atingido. Aguarde alguns minutos antes de tentar de novo.",
      };
    case "process_restricted":
      return { color: "secondary", requestId, message: "Processo indisponível para consulta por restrição de acesso." };
    case "process_not_found":
      return { color: "warning", requestId, message: "Processo não encontrado. Revise o número ou altere o tribunal." };
    default:
      break;
  }

  // Sem `code` util: 5xx continua sendo falha de fonte, 4xx e problema da
  // requisicao, e so o resto vira erro generico nosso.
  if (error.status >= 500) {
    return {
      color: "warning",
      requestId,
      message:
        "A base oficial de consulta do CNJ está indisponível no momento. Isso é uma instabilidade da fonte, não do sistema — tente novamente em alguns minutos.",
    };
  }
  if (error.status === 429) {
    return { color: "warning", requestId, message: "Limite de consultas da fonte oficial atingido. Tente mais tarde." };
  }
  return { color: "danger", requestId, message: fallback };
}
