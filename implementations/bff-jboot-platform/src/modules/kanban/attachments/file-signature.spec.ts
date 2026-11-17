import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ALLOWED_ATTACHMENT_CONTENT_TYPES, assertAttachmentFileAllowed } from './attachments.service';
import { CONTENT_SIGNATURE_RULES, contentMatchesDeclaredType, isSafePlainText } from './file-signature';

const bytes = (...values: number[]) => Buffer.from(values);
const text = (value: string) => Buffer.from(value, 'utf8');
const withTail = (head: Buffer) => Buffer.concat([head, text('resto do arquivo')]);

// Cabecalho PNG + inicio do chunk IHDR (comprimento 0x0000000D), como num arquivo real.
const PNG = withTail(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52));
const JPEG = withTail(bytes(0xff, 0xd8, 0xff, 0xe0));
const GIF87 = withTail(text('GIF87a'));
const GIF89 = withTail(text('GIF89a'));
const WEBP = withTail(Buffer.concat([text('RIFF'), bytes(0x24, 0x00, 0x00, 0x00), text('WEBPVP8 ')]));
const PDF = withTail(text('%PDF-1.7\n'));
const OLE = withTail(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1));
const ZIP_LOCAL = withTail(bytes(0x50, 0x4b, 0x03, 0x04));
const ZIP_EMPTY = Buffer.concat([bytes(0x50, 0x4b, 0x05, 0x06), Buffer.alloc(18)]);
const ZIP_SPANNED = withTail(bytes(0x50, 0x4b, 0x07, 0x08, 0x50, 0x4b, 0x03, 0x04));
const HTML = text('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>');

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

void test('assinatura: todo tipo da allowlist tem regra (sem tipo aceito sem verificacao)', () => {
  assert.deepEqual([...ALLOWED_ATTACHMENT_CONTENT_TYPES].sort(), Object.keys(CONTENT_SIGNATURE_RULES).sort());
});

void test('assinatura: tipo sem regra e buffer ausente falham fechado', () => {
  assert.equal(contentMatchesDeclaredType('text/html', HTML), false);
  assert.equal(contentMatchesDeclaredType('constructor', PDF), false);
  assert.equal(contentMatchesDeclaredType('application/pdf', undefined), false);
  assert.equal(contentMatchesDeclaredType('application/pdf', Buffer.alloc(0)), false);
});

void test('assinatura PNG: aceita PNG, rejeita JPEG e PNG truncado', () => {
  assert.equal(contentMatchesDeclaredType('image/png', PNG), true);
  assert.equal(contentMatchesDeclaredType('image/png', JPEG), false);
  assert.equal(contentMatchesDeclaredType('image/png', bytes(0x89, 0x50, 0x4e, 0x47)), false);
});

void test('assinatura JPEG: aceita FF D8 FF, rejeita PNG', () => {
  assert.equal(contentMatchesDeclaredType('image/jpeg', JPEG), true);
  assert.equal(contentMatchesDeclaredType('image/jpeg', PNG), false);
});

void test('assinatura GIF: aceita GIF87a e GIF89a, rejeita outro cabecalho', () => {
  assert.equal(contentMatchesDeclaredType('image/gif', GIF87), true);
  assert.equal(contentMatchesDeclaredType('image/gif', GIF89), true);
  assert.equal(contentMatchesDeclaredType('image/gif', withTail(text('GIF90a'))), false);
});

void test('assinatura WEBP: exige RIFF + WEBP no offset 8, rejeita outro RIFF (WAVE)', () => {
  assert.equal(contentMatchesDeclaredType('image/webp', WEBP), true);
  const wave = withTail(Buffer.concat([text('RIFF'), bytes(0x24, 0x00, 0x00, 0x00), text('WAVEfmt ')]));
  assert.equal(contentMatchesDeclaredType('image/webp', wave), false);
});

void test('assinatura PDF: exige %PDF- no inicio, rejeita prefixo sem hifen e PDF deslocado', () => {
  assert.equal(contentMatchesDeclaredType('application/pdf', PDF), true);
  assert.equal(contentMatchesDeclaredType('application/pdf', text('%PDF')), false);
  assert.equal(contentMatchesDeclaredType('application/pdf', text('<html>%PDF-1.7')), false);
});

void test('assinatura OLE (application/msword): aceita CFB, rejeita ZIP', () => {
  assert.equal(contentMatchesDeclaredType('application/msword', OLE), true);
  assert.equal(contentMatchesDeclaredType('application/msword', ZIP_LOCAL), false);
});

void test('assinatura OOXML (docx/xlsx/pptx): exige entrada local ZIP, rejeita OLE e ZIP vazio', () => {
  for (const type of [DOCX, XLSX, PPTX]) {
    assert.equal(contentMatchesDeclaredType(type, ZIP_LOCAL), true, type);
    assert.equal(contentMatchesDeclaredType(type, OLE), false, type);
    assert.equal(contentMatchesDeclaredType(type, ZIP_EMPTY), false, type);
  }
});

void test('assinatura ZIP: aceita entrada local, vazio e dividido; rejeita PDF', () => {
  assert.equal(contentMatchesDeclaredType('application/zip', ZIP_LOCAL), true);
  assert.equal(contentMatchesDeclaredType('application/zip', ZIP_EMPTY), true);
  assert.equal(contentMatchesDeclaredType('application/zip', ZIP_SPANNED), true);
  assert.equal(contentMatchesDeclaredType('application/zip', PDF), false);
});

void test('texto (text/plain, text/csv): aceita texto UTF-8 com BOM e acentos', () => {
  for (const type of ['text/plain', 'text/csv']) {
    assert.equal(contentMatchesDeclaredType(type, text('nome;cpf\nJoao;000\n')), true, type);
    assert.equal(contentMatchesDeclaredType(type, Buffer.concat([bytes(0xef, 0xbb, 0xbf), text('Ação, observação')])), true, type);
    // Menor-que no inicio sem ser marcador ativo continua texto.
    assert.equal(contentMatchesDeclaredType(type, text('<3 cliente <htm')), true, type);
  }
});

void test('texto: rejeita byte NUL em qualquer posicao', () => {
  assert.equal(isSafePlainText(text('a,b\nc,d\u0000')), false);
  assert.equal(contentMatchesDeclaredType('text/csv', Buffer.concat([text('a,b\n'), bytes(0x00), text('c')])), false);
  assert.equal(contentMatchesDeclaredType('text/plain', PNG), false);
});

void test('texto: rejeita inicio de HTML/script/SVG ignorando BOM, espacos e caixa', () => {
  const samples = [
    '<!DOCTYPE html><p>x</p>',
    '<!doctype   HTML>',
    '<html lang="pt">',
    '<HTML>',
    '<script>alert(1)</script>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    ' \t\r\n<script>x</script>'
  ];
  for (const sample of samples) {
    assert.equal(isSafePlainText(text(sample)), false, sample);
    assert.equal(isSafePlainText(Buffer.concat([bytes(0xef, 0xbb, 0xbf), text(`\n  ${sample}`)])), false, `BOM+${sample}`);
  }
});

void test('assertAttachmentFileAllowed: HTML declarado como image/png gera 415 content_signature_mismatch sem ecoar o nome', () => {
  const file = { originalname: 'RG Fulano de Tal.png', mimetype: 'image/png', size: HTML.length, buffer: HTML };
  assert.throws(
    () => assertAttachmentFileAllowed(file),
    (error: { getStatus: () => number; getResponse: () => unknown }) => {
      assert.equal(error.getStatus(), 415);
      const response = error.getResponse() as { code: string; message: string };
      assert.equal(response.code, 'content_signature_mismatch');
      assert.equal(JSON.stringify(response).includes('Fulano'), false);
      return true;
    }
  );
});

void test('assertAttachmentFileAllowed: HTML declarado como text/plain gera 415; PNG valido passa', () => {
  assert.throws(
    () => assertAttachmentFileAllowed({ originalname: 'a.txt', mimetype: 'text/plain', size: HTML.length, buffer: HTML }),
    (error: { getStatus: () => number; getResponse: () => { code: string } }) =>
      error.getStatus() === 415 && error.getResponse().code === 'content_signature_mismatch'
  );
  const png = { originalname: 'a.png', mimetype: 'image/png', size: PNG.length, buffer: PNG };
  assert.equal(assertAttachmentFileAllowed(png), png);
});
