import { extname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OfficeKitAnalysisOutcome } from '../offices/service-contract/office-kit-docx';
import { OfficeKitRenderFailure, OfficeKitRenderInput, OfficeKitRenderSuccess } from '../offices/service-contract/office-kit-render';
import { TEMPLATE_LIMITS, TemplateLimits } from './docx-package';
import { DocxEditedSuccess, DocxRenderSuccess, DocxTaskFailure } from './docx-render';
import { TemplateValidationOutcome } from './docx-template-validator';
import { TemplateData } from './template-variable-catalog';

type DocxTask = 'validate' | 'render' | 'inspect_edited' | 'analyze_office_kit' | 'render_office_kit';

export interface ValidationRunnerOptions {
  timeoutMs: number;
  maxOldGenerationSizeMb: number;
  maxConcurrent: number;
}

/** Folga para o pior caso permitido pelos limites (50 MB descompactados). */
export const DEFAULT_VALIDATION_RUNNER_OPTIONS: ValidationRunnerOptions = Object.freeze({
  timeoutMs: 20_000,
  maxOldGenerationSizeMb: 512,
  maxConcurrent: 2
});

/** Token opcional para sobrescrever as opcoes (testes); sem provider = defaults. */
export const TEMPLATE_VALIDATION_RUNNER_OPTIONS = 'TEMPLATE_VALIDATION_RUNNER_OPTIONS';

const WORKER_FILE = `template-validation.worker${extname(__filename)}`;

/**
 * Executa o processamento de `.docx` numa worker thread com timeout, teto de
 * heap e concorrencia limitada por processo (compartilhada entre as tarefas).
 * Timeout ou falta de memoria = recusa (falha fechada):
 * - `validate` (S5): o modelo nunca e salvo sem validacao completa;
 * - `render` (S6): documento gerado a partir do modelo e dos dados do lead;
 * - `inspectEdited` (S6): versao editada enviada pelo gestor;
 * - `analyzeOfficeKit`: `.docx` do kit do escritorio (contrato de servicos, Sprint 3);
 * - `renderOfficeKit`: kit do cliente montado sobre esse `.docx` (Sprint 4).
 */
@Injectable()
export class TemplateValidationRunner {
  private readonly logger = new Logger(TemplateValidationRunner.name);
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    @Optional()
    @Inject(TEMPLATE_VALIDATION_RUNNER_OPTIONS)
    private readonly options: ValidationRunnerOptions = DEFAULT_VALIDATION_RUNNER_OPTIONS
  ) {}

  validate(file: Buffer, limits: TemplateLimits = TEMPLATE_LIMITS): Promise<TemplateValidationOutcome> {
    return this.run<TemplateValidationOutcome>('validate', file, limits);
  }

  render(file: Buffer, data: TemplateData, limits: TemplateLimits = TEMPLATE_LIMITS): Promise<DocxRenderSuccess | DocxTaskFailure> {
    return this.run<DocxRenderSuccess | DocxTaskFailure>('render', file, limits, data);
  }

  inspectEdited(file: Buffer, limits: TemplateLimits = TEMPLATE_LIMITS): Promise<DocxEditedSuccess | DocxTaskFailure> {
    return this.run<DocxEditedSuccess | DocxTaskFailure>('inspect_edited', file, limits);
  }

  analyzeOfficeKit(file: Buffer, limits: TemplateLimits = TEMPLATE_LIMITS): Promise<OfficeKitAnalysisOutcome> {
    return this.run<OfficeKitAnalysisOutcome>('analyze_office_kit', file, limits);
  }

  renderOfficeKit(file: Buffer, kit: OfficeKitRenderInput, limits: TemplateLimits = TEMPLATE_LIMITS): Promise<OfficeKitRenderSuccess | OfficeKitRenderFailure> {
    return this.run<OfficeKitRenderSuccess | OfficeKitRenderFailure>('render_office_kit', file, limits, undefined, kit);
  }

  private async run<T>(task: DocxTask, file: Buffer, limits: TemplateLimits, data?: TemplateData, kit?: OfficeKitRenderInput): Promise<T> {
    await this.acquire();
    try {
      return (await this.runWorker(task, file, limits, data, kit)) as T;
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.options.maxConcurrent) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.running -= 1;
    }
  }

  private runWorker(task: DocxTask, file: Buffer, limits: TemplateLimits, data?: TemplateData, kit?: OfficeKitRenderInput): Promise<TemplateValidationOutcome> {
    return new Promise((resolve) => {
      // Em teste (ts-node) o worker e `.ts`; no build e `.js`. Sem herdar execArgv do processo (tracing etc.).
      const execArgv = WORKER_FILE.endsWith('.ts') ? ['--require', 'ts-node/register/transpile-only'] : [];
      const worker = new Worker(join(__dirname, WORKER_FILE), {
        workerData: { task, file: new Uint8Array(file), limits, data, kit },
        execArgv,
        resourceLimits: { maxOldGenerationSizeMb: this.options.maxOldGenerationSizeMb }
      });
      let settled = false;
      const finish = (outcome: TemplateValidationOutcome) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          void worker.terminate();
          resolve(outcome);
        }
      };
      const timer = setTimeout(() => {
        this.logger.warn('template_validation_timeout');
        finish({
          ok: false,
          status: 422,
          code: 'template_validation_timeout',
          message: 'Template validation took too long',
          details: { timeoutMs: this.options.timeoutMs }
        });
      }, this.options.timeoutMs);
      worker.once('message', (outcome: TemplateValidationOutcome) => finish(outcome));
      worker.once('error', (error: Error & { code?: string }) => {
        const outOfMemory = error.code === 'ERR_WORKER_OUT_OF_MEMORY';
        this.logger.warn(`template_validation_worker_error code=${error.code ?? 'unknown'}`);
        finish({
          ok: false,
          status: 422,
          code: outOfMemory ? 'template_too_complex' : 'template_invalid',
          message: outOfMemory ? 'Template is too complex to process' : 'Template could not be processed',
          details: { reason: outOfMemory ? 'out_of_memory' : 'worker_error' }
        });
      });
      worker.once('exit', (exitCode) => {
        finish({ ok: false, status: 422, code: 'template_invalid', message: 'Template could not be processed', details: { reason: `worker_exit_${exitCode}` } });
      });
    });
  }
}
