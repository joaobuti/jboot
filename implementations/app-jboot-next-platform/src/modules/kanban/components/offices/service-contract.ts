import { KanbanApiError } from "@/modules/kanban/lib/kanban-api";
import { templateErrorDetails } from "@/modules/kanban/lib/document-templates";

/** Regras de tag do contrato de servicos; o servidor aplica as mesmas na analise do `.docx`. */
const TAG_PATTERN = /\[\[([A-Z0-9_]+)\]\]/g;

/** Envolve cada `[[TAG]]` valida dos nos de texto num `<mark>` (previa das versoes HTML antigas). */
export function highlightTags(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.data;
    if (!/\[\[[A-Z0-9_]+\]\]/.test(text)) continue;
    const fragment = root.ownerDocument.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(TAG_PATTERN)) {
      const index = match.index ?? 0;
      fragment.append(text.slice(last, index));
      const mark = root.ownerDocument.createElement("mark");
      mark.className = "bg-warning-subtle text-warning-emphasis rounded px-1";
      mark.textContent = match[0];
      fragment.append(mark);
      last = index + match[0].length;
    }
    fragment.append(text.slice(last));
    node.replaceWith(fragment);
  }
}

/** Avisos da analise do `.docx` (nao impedem salvar a versao). */
export function describeKitWarning(warning: { code: string; detail?: string }): string {
  switch (warning.code) {
    case "loan_row_missing":
      return "Não há linha-molde de contrato (BANCO_1, CONTRATO_1...) numa tabela. Sem ela, os contratos do cliente não entram no kit.";
    case "waiver_text_missing":
      return "O termo de renúncia não tem o trecho \"RENUNCIA expressamente\" nem os blocos [[SE_JEC]]/[[SE_JEF]]: quando a ação for no JEF, o kit sai com o texto do modelo.";
    case "residence_declaration_removed":
      return "A Declaração de Residência do modelo sai do kit: o cliente já envia a declaração assinada.";
    case "attached_template_external":
      return "O arquivo aponta para um modelo anexo externo do Word; ele é ignorado na geração.";
    default:
      return warning.detail ?? warning.code;
  }
}

/** Mensagem pt-BR dos erros do envio; `null` = nao e erro do contrato nem de arquivo `.docx`. */
export function describeServiceContractError(error: KanbanApiError): string | null {
  const tag = typeof error.payload?.tag === "string" ? error.payload.tag : "";
  switch (error.code) {
    case "service_contract_no_tags":
      return "O arquivo não tem nenhuma tag [[ASSIM]]. Escreva os campos do kit no Word, como [[NOME_COMPLETO]], e envie de novo.";
    case "service_contract_block_unbalanced":
      return `Bloco sem par: ${tag}. Todo [[SE_X]] precisa de um [[FIM_SE_X]] depois dele.`;
    case "service_contract_block_nested": {
      const open = typeof error.payload?.openBlock === "string" ? error.payload.openBlock : "";
      return `O bloco ${tag} abre dentro de ${open}. Feche um bloco antes de abrir o próximo.`;
    }
    case "service_contract_loan_row_outside_table":
      return `A tag ${tag} está fora de uma tabela. As tags _1 dos contratos ficam numa linha de tabela, que o Flow repete por contrato.`;
    case "service_contract_version_without_file":
      return "Esta versão é do editor antigo e não tem arquivo .docx.";
    default:
      // Mesmos codigos de arquivo dos modelos de documento (tipo, tamanho, macro, OLE, vinculo externo).
      return templateErrorDetails(error)?.message ?? null;
  }
}
