import { parentPort, workerData } from 'node:worker_threads';
import { analyzeOfficeKitDocx } from '../offices/service-contract/office-kit-docx';
import { OfficeKitRenderInput, renderOfficeKitDocx } from '../offices/service-contract/office-kit-render';
import { TemplateLimits } from './docx-package';
import { inspectEditedDocx, renderDocxTemplate } from './docx-render';
import { validateDocxTemplate } from './docx-template-validator';
import { TemplateData } from './template-variable-catalog';

/**
 * Worker thread dos arquivos `.docx` do Flow (ADR 014: compilar e renderizar
 * com timeout, fora do event loop que atende os outros tenants). Tarefas:
 * - `validate` (S5): validacao completa do modelo enviado pelo gestor;
 * - `render` (S6): geracao do documento a partir do modelo com os dados do lead;
 * - `inspect_edited` (S6): verificacao de seguranca da versao editada;
 * - `analyze_office_kit`: analise do `.docx` do kit do escritorio (contrato de servicos, Sprint 3);
 * - `render_office_kit`: montagem do kit do cliente sobre esse `.docx` (Sprint 4).
 * Recebe so o arquivo, os limites e (no `render`) os dados; devolve o
 * resultado estruturado. Nunca loga dado.
 */
interface DocxWorkerInput {
  task?: 'validate' | 'render' | 'inspect_edited' | 'analyze_office_kit' | 'render_office_kit';
  file: Uint8Array;
  limits: TemplateLimits;
  data?: TemplateData;
  kit?: OfficeKitRenderInput;
}

const input = workerData as DocxWorkerInput;
const file = Buffer.from(input.file.buffer, input.file.byteOffset, input.file.byteLength);
let outcome: unknown;
try {
  if (input.task === 'render') {
    outcome = renderDocxTemplate(file, input.data ?? {}, input.limits);
  } else if (input.task === 'inspect_edited') {
    outcome = inspectEditedDocx(file, input.limits);
  } else if (input.task === 'analyze_office_kit') {
    outcome = analyzeOfficeKitDocx(file, input.limits);
  } else if (input.task === 'render_office_kit' && input.kit) {
    outcome = renderOfficeKitDocx(file, input.kit, input.limits);
  } else {
    outcome = validateDocxTemplate(file, input.limits);
  }
} catch {
  outcome = { ok: false, status: 422, code: 'template_invalid', message: 'Template could not be processed', details: { reason: 'worker_error' } };
}
parentPort?.postMessage(outcome);
