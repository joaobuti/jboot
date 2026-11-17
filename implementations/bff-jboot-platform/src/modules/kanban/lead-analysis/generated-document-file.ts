import { PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { assertAttachmentFileAllowed, UploadedFile } from '../attachments/attachments.service';
import { DOCX_CONTENT_TYPE, TEMPLATE_LIMITS } from '../document-templates/docx-package';

/**
 * Versao editada enviada pelo gestor (CRM de leads, Sprint 6): mesmas regras
 * de arquivo dos anexos (`assertAttachmentFileAllowed`: tamanho, allowlist e
 * assinatura) e do modelo (so `.docx` por tipo e extensao, no maximo 10 MB
 * compactado); o pacote ainda passa por `inspectEdited` no worker (limites
 * anti zip-bomb, macro, OLE/ActiveX, vinculo externo). Mensagens sem o nome do
 * arquivo (pode conter dado pessoal).
 */
export function assertEditedDocumentFileAllowed(file: UploadedFile | undefined): UploadedFile {
  const allowed = assertAttachmentFileAllowed(file);
  if (allowed.mimetype !== DOCX_CONTENT_TYPE || !/\.docx$/i.test(allowed.originalname)) {
    throw new UnsupportedMediaTypeException({
      code: 'document_content_type_not_allowed',
      message: 'Only Word documents (.docx) are accepted as the edited version'
    });
  }
  if (allowed.size > TEMPLATE_LIMITS.maxCompressedBytes) {
    throw new PayloadTooLargeException({
      code: 'document_too_large',
      message: 'Edited document exceeds the allowed size',
      max: TEMPLATE_LIMITS.maxCompressedBytes
    });
  }
  return allowed;
}

/**
 * Nome do arquivo baixado (a chave do objeto nao tem nome): titulo do modelo +
 * versao do documento; versao nunca aprovada (rascunho, inclusive o
 * substituido) marcada como rascunho. Sem dado do cliente.
 */
export function generatedDocumentFileName(templateName: string, version: number, approved: boolean, format: 'docx' | 'pdf'): string {
  const base = templateName.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'documento';
  const label = approved ? `v${version}` : `rascunho v${version}`;
  return `${base} - ${label}.${format}`;
}
