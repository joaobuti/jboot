import { decodeXmlText, extractZipEntries, readZipDirectory } from '../document-templates/docx-package';

/** Tamanho de cada parte do texto do kit entregue a rotina (cabe com folga no limite de resposta da ferramenta). */
export const KIT_TEXT_PART_CHARS = 12000;

/**
 * Texto visivel do kit gerado pelo Flow (`word/document.xml`, um paragrafo por linha), para o Validador de
 * assinatura comparar com o kit assinado sem converter o `.docx` em PDF. Os limites do leitor de `.docx` do
 * Flow valem aqui (tamanho, zip-bomb); paragrafo vazio vira linha vazia, o que marca a separacao dos blocos.
 */
export function officeKitText(docx: Buffer): string {
  const entries = readZipDirectory(docx).filter((entry) => entry.name === 'word/document.xml');
  const xml = extractZipEntries(docx, entries).get('word/document.xml')?.toString('utf8') ?? '';
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((paragraph) => decodeXmlText([...paragraph[0].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Parte `part` (1..partCount) do texto, cortada em quebra de linha quando possivel. */
export function kitTextPart(text: string, part: number): { part: number; partCount: number; text: string } {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > KIT_TEXT_PART_CHARS) {
    const cut = rest.lastIndexOf('\n', KIT_TEXT_PART_CHARS);
    const at = cut > KIT_TEXT_PART_CHARS / 2 ? cut : KIT_TEXT_PART_CHARS;
    parts.push(rest.slice(0, at));
    rest = rest.slice(at).replace(/^\n/, '');
  }
  parts.push(rest);
  const index = Math.min(Math.max(part, 1), parts.length) - 1;
  return { part: index + 1, partCount: parts.length, text: parts[index] };
}
