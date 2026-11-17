import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JuridicoRequestContext } from '../shared/juridico.types';
import { CaptacaoExportRow, CaptacaoRepository } from './captacao.repository';
import {
  CaptacaoCpfDto,
  CaptacaoPageDto,
  ImportResultDto,
  SchedulingConfigDto,
} from './dto/captacao.dto';

const CPF_REGEX = /^\d{11}$/;
const VALID_INTERVALS = ['daily', 'weekly', 'biweekly', 'monthly'];
const EXPORT_COLUMNS: Array<{ key: keyof CaptacaoExportRow; label: string }> = [
  { key: 'nome', label: 'Nome' },
  { key: 'cpf', label: 'CPF' },
  { key: 'processNumber', label: 'Numero do processo' },
  { key: 'author', label: 'Autor' },
  { key: 'defendant', label: 'Reu' },
  { key: 'partiesText', label: 'Parties' },
  { key: 'subject', label: 'Tema' },
  { key: 'dataAutuacao', label: 'Data autuacao' },
];

@Injectable()
export class CaptacaoService {
  constructor(private readonly repo: CaptacaoRepository) {}

  async importCpfs(
    ctx: JuridicoRequestContext,
    rawEntries: { cpf: string; nome: string }[],
    rawUf: string,
    filename?: string,
  ): Promise<ImportResultDto> {
    if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
      throw new BadRequestException('entries must be a non-empty array');
    }
    const uf = rawUf.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) {
      throw new BadRequestException('uf must be a valid 2-letter state code');
    }

    const seen = new Set<string>();
    const valid: { cpf: string; nome: string }[] = [];
    for (const entry of rawEntries) {
      const cpf = entry.cpf.replace(/\D/g, '');
      if (CPF_REGEX.test(cpf) && !seen.has(cpf)) {
        seen.add(cpf);
        valid.push({ cpf, nome: (entry.nome ?? '').trim() });
      }
    }

    if (valid.length === 0) {
      throw new BadRequestException('No valid CPFs found in the list');
    }

    const validCpfs = valid.map((e) => e.cpf);

    const before = await this.repo.countCpfs(ctx.clientId, ctx.databaseRef);
    await this.repo.insertCpfs(ctx.clientId, ctx.databaseRef, valid);
    const after = await this.repo.countCpfs(ctx.clientId, ctx.databaseRef);

    const imported = after - before;
    const skipped = valid.length - imported;

    const importId = await this.repo.createImport(
      ctx.clientId,
      ctx.databaseRef,
      uf,
      filename,
      ctx.identityId,
    );
    await this.repo.linkImportCpfs(ctx.clientId, ctx.databaseRef, importId, validCpfs);
    await this.repo.createMissingConsultations(ctx.clientId, ctx.databaseRef, validCpfs, importId, uf);

    return { imported, skipped, importId, uf };
  }

  async list(ctx: JuridicoRequestContext, limit: number, offset: number): Promise<CaptacaoPageDto> {
    const total = await this.repo.countCpfs(ctx.clientId, ctx.databaseRef);
    const cpfRows = await this.repo.listCpfs(ctx.clientId, ctx.databaseRef, limit, offset);

    const cpfIds = cpfRows.map((r) => r.id);
    const consultationRows = await this.repo.listConsultations(ctx.clientId, ctx.databaseRef, cpfIds);

    const consultationsByCpfId = new Map<string, typeof consultationRows>();
    for (const row of consultationRows) {
      const list = consultationsByCpfId.get(row.cpfId) ?? [];
      list.push(row);
      consultationsByCpfId.set(row.cpfId, list);
    }

    const data: CaptacaoCpfDto[] = cpfRows.map((cpf) => ({
      id: cpf.id,
      cpf: cpf.cpf,
      nome: cpf.nome ?? null,
      createdAt: cpf.createdAt,
      consultations: (consultationsByCpfId.get(cpf.id) ?? []).map((c) => ({
        portalSlug: c.portalSlug,
        portalName: c.portalName,
        status: c.status as 'pending' | 'done' | 'error',
        lastConsultedAt: c.lastConsultedAt ?? null,
        errorMessage: c.errorMessage ?? null,
      })),
    }));

    return { data, meta: { limit, offset, total } };
  }

  async getSchedulingConfig(ctx: JuridicoRequestContext, portalSlug: string): Promise<SchedulingConfigDto> {
    const row = await this.repo.getSchedulingConfig(ctx.clientId, ctx.databaseRef, portalSlug);
    if (!row) throw new NotFoundException(`Portal '${portalSlug}' not found`);
    return {
      portalSlug: row.portalSlug,
      interval: row.interval ?? null,
      status: row.status ?? null,
      lastRunAt: row.lastRunAt ?? null,
      nextRunAt: row.nextRunAt ?? null,
    };
  }

  async setSchedulingConfig(
    ctx: JuridicoRequestContext,
    portalSlug: string,
    interval: string,
  ): Promise<SchedulingConfigDto> {
    if (!VALID_INTERVALS.includes(interval)) {
      throw new BadRequestException(`interval must be one of: ${VALID_INTERVALS.join(', ')}`);
    }
    await this.repo.upsertSchedulingConfig(ctx.clientId, ctx.databaseRef, portalSlug, interval);
    return this.getSchedulingConfig(ctx, portalSlug);
  }

  async exportFoundProcesses(
    ctx: JuridicoRequestContext,
    format: 'excel' | 'pdf',
  ): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
    if (format !== 'excel' && format !== 'pdf') {
      throw new BadRequestException('format must be excel or pdf');
    }

    const rows = await this.repo.listExportRows(ctx.clientId, ctx.databaseRef);
    const date = new Date().toISOString().slice(0, 10);

    if (format === 'excel') {
      return {
        filename: `captacao-processos-${date}.xls`,
        contentType: 'application/vnd.ms-excel; charset=utf-8',
        buffer: Buffer.from(this.buildExcelHtml(rows), 'utf8'),
      };
    }

    return {
      filename: `captacao-processos-${date}.pdf`,
      contentType: 'application/pdf',
      buffer: this.buildPdf(rows),
    };
  }

  private buildExcelHtml(rows: CaptacaoExportRow[]): string {
    const title = this.exportTitle();
    const header = EXPORT_COLUMNS.map((column) => `<th>${this.escapeHtml(column.label)}</th>`).join('');
    const body = rows
      .map((row) => {
        const cells = EXPORT_COLUMNS.map((column) => this.buildExcelCell(row, column.key))
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th, td { border: 1px solid #999; padding: 6px; vertical-align: top; }
    th { background: #e8edf3; font-weight: bold; }
    .title { background: #d9e2f3; font-size: 16px; font-weight: bold; text-align: left; }
    .text-cell { mso-number-format:"\\@"; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr><th class="title" colspan="${EXPORT_COLUMNS.length}">${this.escapeHtml(title)}</th></tr>
      <tr>${header}</tr>
    </thead>
    <tbody>${body || `<tr><td colspan="${EXPORT_COLUMNS.length}">Nenhum registro encontrado</td></tr>`}</tbody>
  </table>
</body>
</html>`;
  }

  private buildExcelCell(row: CaptacaoExportRow, key: keyof CaptacaoExportRow): string {
    const value = this.formatExportValue(row, key);
    const textAttributes = key === 'cpf' || key === 'processNumber'
      ? ' class="text-cell" style="mso-number-format:&quot;\\@&quot;;"'
      : '';
    return `<td${textAttributes}>${this.escapeHtml(value)}</td>`;
  }

  private buildPdf(rows: CaptacaoExportRow[]): Buffer {
    return this.writeTablePdf(rows);
  }

  private writeTablePdf(rows: CaptacaoExportRow[]): Buffer {
    const title = this.exportTitle();
    const pageWidth = 842;
    const pageHeight = 595;
    const marginX = 28;
    const marginTop = 34;
    const rowHeight = 34;
    const headerHeight = 28;
    const titleHeight = 24;
    const columns = [
      { key: 'nome' as const, label: 'Nome', x: marginX, width: 120 },
      { key: 'cpf' as const, label: 'CPF', x: marginX + 120, width: 72 },
      { key: 'processNumber' as const, label: 'Numero do processo', x: marginX + 192, width: 110 },
      { key: 'author' as const, label: 'Autor', x: marginX + 302, width: 100 },
      { key: 'defendant' as const, label: 'Reu', x: marginX + 402, width: 100 },
      { key: 'subject' as const, label: 'Tema', x: marginX + 502, width: 110 },
      { key: 'dataAutuacao' as const, label: 'Data autuacao', x: marginX + 612, width: 90 },
    ];
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const rowsPerPage = Math.max(1, Math.floor((pageHeight - marginTop - titleHeight - headerHeight - 36) / rowHeight));
    const chunks: CaptacaoExportRow[][] = [];
    for (let i = 0; i < rows.length; i += rowsPerPage) {
      chunks.push(rows.slice(i, i + rowsPerPage));
    }
    if (chunks.length === 0) {
      chunks.push([]);
    }

    const pages = chunks.map((chunk, pageIndex) => {
      const commands: string[] = [];
      const tableTop = pageHeight - marginTop - titleHeight;

      commands.push('0.85 0.89 0.95 rg');
      commands.push(`${marginX} ${tableTop + headerHeight} ${tableWidth} ${titleHeight} re f`);
      commands.push('0 g');
      commands.push(this.pdfText(title, marginX + 6, tableTop + headerHeight + 8, 14));

      commands.push('0.91 0.93 0.96 rg');
      commands.push(`${marginX} ${tableTop} ${tableWidth} ${headerHeight} re f`);
      commands.push('0 g');
      for (const column of columns) {
        commands.push(this.pdfText(column.label, column.x + 4, tableTop + 10, 8));
      }

      let y = tableTop - rowHeight;
      if (chunk.length === 0) {
        commands.push(this.pdfText('Nenhum registro encontrado', marginX + 6, y + 12, 9));
      }

      for (const row of chunk) {
        for (const column of columns) {
          commands.push(this.pdfText(
            this.truncateForPdf(this.formatExportValue(row, column.key), Math.max(8, Math.floor(column.width / 5.2))),
            column.x + 4,
            y + 20,
            8,
          ));
        }
        y -= rowHeight;
      }

      const renderedRows = Math.max(1, chunk.length);
      const tableBottom = tableTop - renderedRows * rowHeight;
      commands.push('0.55 0.55 0.55 RG');
      commands.push('0.5 w');
      commands.push(`${marginX} ${tableBottom} ${tableWidth} ${titleHeight + headerHeight + renderedRows * rowHeight} re S`);
      commands.push(`${marginX} ${tableTop} m ${marginX + tableWidth} ${tableTop} l S`);
      commands.push(`${marginX} ${tableTop + headerHeight} m ${marginX + tableWidth} ${tableTop + headerHeight} l S`);
      for (let i = 0; i <= renderedRows; i++) {
        const lineY = tableTop - i * rowHeight;
        commands.push(`${marginX} ${lineY} m ${marginX + tableWidth} ${lineY} l S`);
      }
      for (const column of columns) {
        commands.push(`${column.x} ${tableBottom} m ${column.x} ${tableTop + headerHeight + titleHeight} l S`);
      }
      commands.push(`${marginX + tableWidth} ${tableBottom} m ${marginX + tableWidth} ${tableTop + headerHeight + titleHeight} l S`);
      commands.push(this.pdfText(`Pagina ${pageIndex + 1} de ${chunks.length}`, pageWidth - 94, 18, 8));

      return commands.join('\n');
    });

    return this.writePdfPages(pages, [0, 0, pageWidth, pageHeight]);
  }

  private writePdfPages(pageContents: string[], mediaBox: [number, number, number, number]): Buffer {
    const objects: string[] = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      `2 0 obj\n<< /Type /Pages /Kids [${pageContents.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pageContents.length} >>\nendobj\n`,
    ];

    for (let index = 0; index < pageContents.length; index++) {
      const pageObjectId = 3 + index * 2;
      const contentObjectId = pageObjectId + 1;
      const content = pageContents[index];
      objects.push(
        `${pageObjectId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [${mediaBox.join(' ')}] /Resources << /Font << /F1 ${3 + pageContents.length * 2} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`,
        `${contentObjectId} 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj\n`,
      );
    }
    objects.push(`${3 + pageContents.length * 2} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const object of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += object;
    }
    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (const offset of offsets.slice(1)) {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
  }

  private pdfText(value: string, x: number, y: number, size: number): string {
    return `BT /F1 ${size} Tf ${x} ${y} Td (${this.escapePdfText(value)}) Tj ET`;
  }

  private truncateForPdf(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
  }

  private exportTitle(): string {
    return `JBoot - Juridico - ${new Date().toLocaleDateString('pt-BR')}`;
  }

  private formatExportValue(row: CaptacaoExportRow, key: keyof CaptacaoExportRow): string {
    const value = row[key];
    if (!value) return '';
    if (key === 'dataAutuacao') {
      if (value instanceof Date) {
        return value.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T00:00:00.000Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      }
      return String(value);
    }
    return String(value);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapePdfText(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
}
