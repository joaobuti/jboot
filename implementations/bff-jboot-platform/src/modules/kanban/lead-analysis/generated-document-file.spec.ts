import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpException } from '@nestjs/common';
import { buildDocx } from '../../../test/docx-fixture';
import { StorageService } from '../attachments/storage.service';
import { DOCX_CONTENT_TYPE } from '../document-templates/docx-package';
import { assertEditedDocumentFileAllowed, generatedDocumentFileName } from './generated-document-file';

const code = (error: unknown) => ((error as HttpException).getResponse() as { code?: string }).code;
const file = (buffer: Buffer, originalname = 'revisado.docx', mimetype = DOCX_CONTENT_TYPE) => ({
  originalname,
  mimetype,
  size: buffer.length,
  buffer
});

void test('versao editada: regras dos anexos + so .docx + 10 MB, sem ecoar o nome do arquivo', () => {
  const docx = buildDocx();
  assert.equal(assertEditedDocumentFileAllowed(file(docx)).size, docx.length);
  assert.throws(() => assertEditedDocumentFileAllowed(undefined), (error) => code(error) === 'file_required');
  assert.throws(() => assertEditedDocumentFileAllowed(file(docx, 'Maria.docm')), (error) => {
    assert.equal(code(error), 'document_content_type_not_allowed');
    assert.doesNotMatch(JSON.stringify((error as HttpException).getResponse()), /Maria/);
    return true;
  });
  assert.throws(() => assertEditedDocumentFileAllowed(file(Buffer.from('nao e zip'))), (error) => code(error) === 'content_signature_mismatch');
  const big = Buffer.concat([docx, Buffer.alloc(10 * 1024 * 1024)]);
  assert.throws(() => assertEditedDocumentFileAllowed(file(big)), (error) => code(error) === 'document_too_large');
});

void test('nome do download: modelo + versao; nunca aprovado = rascunho; caracteres inseguros removidos', () => {
  assert.equal(generatedDocumentFileName('Peticao: "inicial"/INSS', 2, true, 'pdf'), 'Peticao inicial INSS - v2.pdf');
  assert.equal(generatedDocumentFileName('Procuracao', 1, false, 'docx'), 'Procuracao - rascunho v1.docx');
  assert.equal(generatedDocumentFileName('  ', 3, true, 'docx'), 'documento - v3.docx');
});

void test('chave do documento gerado: prefixo do tenant e do card, id do documento, sem nome de arquivo', () => {
  const key = StorageService.prototype.buildGeneratedDocumentKey({ clientId: 'c', cardId: 'k', documentId: 'd', format: 'pdf' });
  assert.equal(key, 'c/k/generated/d.pdf');
});
