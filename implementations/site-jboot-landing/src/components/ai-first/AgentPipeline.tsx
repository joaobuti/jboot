"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AgentId = "po" | "architect" | "uiux" | "engineer" | "backend" | "frontend";
type TraceActor = AgentId | "human-gate";
type Status = "idle" | "queued" | "running" | "done";
type PipelineLocale = "pt" | "en" | "es";

type AgentDefinition = {
  id: AgentId;
  name: string;
  role: string;
  model: string;
};

type Step = {
  agent: TraceActor;
  ms: number;
  log: string;
  artifact?: { label: string; value: string };
  code?: string;
};

const pipelineCopy = {
  pt: {
    defaultFileName: "requisitos-projeto.pdf",
    agents: [
      { id: "po", name: "Agent PO", role: "Leitura de requisitos", model: "reasoning · context" },
      { id: "architect", name: "Agent Architect", role: "Stack Fit Gate", model: "reasoning · tools" },
      { id: "uiux", name: "Agent UI/UX", role: "Reuso de padrao visual", model: "reasoning · design system" },
      { id: "engineer", name: "Agent Engineer", role: "Agents, skills e gates", model: "code · repo-aware" },
      { id: "backend", name: "Agent Backend", role: "Servicos e regras", model: "code · executor" },
      { id: "frontend", name: "Agent Frontend", role: "Interface e rotas", model: "code · executor" },
    ],
    discoveryScript: [
      { agent: "po", ms: 450, log: "Documento recebido no navegador · iniciando leitura simulada..." },
      { agent: "po", ms: 650, log: "Escopo, criterios e perguntas abertas organizados.", artifact: { label: "backlog.json", value: "escopo · criterios · perguntas abertas" } },
      { agent: "po", ms: 400, log: "Handoff → Agent Architect" },
      { agent: "architect", ms: 600, log: "Stack Fit Gate: comparando SEO, interatividade, runtime, deploy, testes e evolucao." },
      { agent: "architect", ms: 650, log: "Stack, agents e skills recomendados com alternativas rejeitadas.", artifact: { label: "stack-fit-gate.md", value: "candidatas · trade-offs · recomendacao" } },
      { agent: "architect", ms: 400, log: "Recomendacao pronta · aguardando confirmacao humana obrigatoria." },
    ],
    executionScript: [
      { agent: "human-gate", ms: 250, log: "Stack e plano de execucao aprovados para esta simulacao.", artifact: { label: "human-decision.json", value: "decisao · responsavel · contexto" } },
      { agent: "uiux", ms: 500, log: "UI/UX: verificando cobertura em app-jboot-identity-admin e platform-crud-ui antes de propor padrao novo." },
      { agent: "uiux", ms: 400, log: "Padrao reaproveitado do preset · Handoff → Agent Engineer" },
      { agent: "engineer", ms: 500, log: "Carregando PROJECT_CONTRACT, MODULE_CONTRACT e instrucoes do target." },
      { agent: "engineer", ms: 600, log: "Preflight registrado: agents, skills, gates e testes equivalentes.", artifact: { label: "execution-preflight.json", value: "target · agents · skills · testes" } },
      { agent: "engineer", ms: 500, log: "Skill platform-crud-ui selecionada somente se houver CRUD administrativo." },
      { agent: "engineer", ms: 500, log: "Skill security-checklist exigida se endpoints, auth, queries ou storage forem afetados." },
      { agent: "engineer", ms: 400, log: "Fan-out → Agent Backend + Agent Frontend com skills aplicaveis" },
      { agent: "backend", ms: 650, log: "Implementando regras no limite de dominio aprovado.", code: "type Result = { status: 'ok' | 'error'; evidence: string[] };" },
      { agent: "backend", ms: 550, log: "Testes automatizados executados no cenario ilustrativo." },
      { agent: "frontend", ms: 600, log: "Aplicando skill de UI selecionada, tokens, responsividade e acessibilidade." },
      { agent: "frontend", ms: 650, log: "Validacoes tecnicas concluidas no cenario ilustrativo.", artifact: { label: "validation.json", value: "lint · types · tests · build" } },
      { agent: "frontend", ms: 450, log: "Entrega preparada para revisao humana.", artifact: { label: "review-gate.md", value: "evidencias · riscos · aprovacao pendente" } },
    ],
    ui: {
      dragPrompt: "Arraste um PDF de requisitos aqui",
      privacyNote: "simulacao · nenhum arquivo e enviado",
      rerun: "Rodar novamente",
      run: "Rodar simulacao",
      status: { idle: "-", queued: "fila", running: "ativo", done: "ok" },
      gateTitle: "Recomendacao para confirmacao humana",
      gateStatus: { idle: "nao iniciado", evaluating: "em analise", waiting: "aguardando voce", approved: "aprovado" },
      deliveryLabel: "entrega classificada",
      deliveryValue: "Aplicacao web modular",
      stackLabel: "stack recomendada",
      stackValue: "Next.js · TypeScript · BFF quando necessario",
      agentsLabel: "agents de execucao",
      agentsValue: "UI/UX · Frontend · Backend · QA",
      skillsLabel: "skills por condicao",
      skillsValue: "platform-crud-ui · security-checklist · qa-web-smoke",
      gateNote: "platform-crud-ui so e ativada para CRUD administrativo; as demais skills dependem do impacto detectado no preflight.",
      approved: "Stack aprovada",
      approve: "Aprovar stack simulada",
      waitingArchitect: "Aguardando Architect",
      progress: "Progresso da simulacao",
      trace: "trace de execucao",
      idleConsole: "aguardando arquivo... solte um PDF ou inicie a simulacao.",
      generating: "gerando...",
      paused: "execucao pausada · confirmacao humana necessaria",
      finished: "simulacao concluida · aguardando revisao humana",
      artifacts: "artefatos ilustrativos",
      generated: "gerado",
      waitingGeneration: "aguardando geracao",
    },
  },
  en: {
    defaultFileName: "project-requirements.pdf",
    agents: [
      { id: "po", name: "Agent PO", role: "Requirement reading", model: "reasoning · context" },
      { id: "architect", name: "Agent Architect", role: "Stack Fit Gate", model: "reasoning · tools" },
      { id: "uiux", name: "Agent UI/UX", role: "Visual pattern reuse", model: "reasoning · design system" },
      { id: "engineer", name: "Agent Engineer", role: "Agents, skills and gates", model: "code · repo-aware" },
      { id: "backend", name: "Agent Backend", role: "Services and rules", model: "code · executor" },
      { id: "frontend", name: "Agent Frontend", role: "Interface and routes", model: "code · executor" },
    ],
    discoveryScript: [
      { agent: "po", ms: 450, log: "Document received in the browser · starting simulated reading..." },
      { agent: "po", ms: 650, log: "Scope, criteria and open questions organized.", artifact: { label: "backlog.json", value: "scope · criteria · open questions" } },
      { agent: "po", ms: 400, log: "Handoff → Agent Architect" },
      { agent: "architect", ms: 600, log: "Stack Fit Gate: comparing SEO, interactivity, runtime, deployment, tests and evolution." },
      { agent: "architect", ms: 650, log: "Stack, agents and skills recommended with rejected alternatives.", artifact: { label: "stack-fit-gate.md", value: "candidates · trade-offs · recommendation" } },
      { agent: "architect", ms: 400, log: "Recommendation ready · waiting for mandatory human confirmation." },
    ],
    executionScript: [
      { agent: "human-gate", ms: 250, log: "Stack and execution plan approved for this simulation.", artifact: { label: "human-decision.json", value: "decision · owner · context" } },
      { agent: "uiux", ms: 500, log: "UI/UX: checking coverage in app-jboot-identity-admin and platform-crud-ui before proposing a new pattern." },
      { agent: "uiux", ms: 400, log: "Pattern reused from the preset · Handoff → Agent Engineer" },
      { agent: "engineer", ms: 500, log: "Loading PROJECT_CONTRACT, MODULE_CONTRACT and target instructions." },
      { agent: "engineer", ms: 600, log: "Preflight registered: agents, skills, gates and equivalent tests.", artifact: { label: "execution-preflight.json", value: "target · agents · skills · tests" } },
      { agent: "engineer", ms: 500, log: "Skill platform-crud-ui selected only when there is administrative CRUD." },
      { agent: "engineer", ms: 500, log: "Skill security-checklist required when endpoints, auth, queries or storage are affected." },
      { agent: "engineer", ms: 400, log: "Fan-out → Agent Backend + Agent Frontend with applicable skills" },
      { agent: "backend", ms: 650, log: "Implementing rules within the approved domain boundary.", code: "type Result = { status: 'ok' | 'error'; evidence: string[] };" },
      { agent: "backend", ms: 550, log: "Automated tests executed in the illustrative scenario." },
      { agent: "frontend", ms: 600, log: "Applying selected UI skill, tokens, responsiveness and accessibility." },
      { agent: "frontend", ms: 650, log: "Technical validations completed in the illustrative scenario.", artifact: { label: "validation.json", value: "lint · types · tests · build" } },
      { agent: "frontend", ms: 450, log: "Delivery prepared for human review.", artifact: { label: "review-gate.md", value: "evidence · risks · pending approval" } },
    ],
    ui: {
      dragPrompt: "Drop a requirements PDF here",
      privacyNote: "simulation · no file is sent",
      rerun: "Run again",
      run: "Run simulation",
      status: { idle: "-", queued: "queue", running: "active", done: "ok" },
      gateTitle: "Recommendation for human confirmation",
      gateStatus: { idle: "not started", evaluating: "evaluating", waiting: "waiting for you", approved: "approved" },
      deliveryLabel: "delivery classified",
      deliveryValue: "Modular web application",
      stackLabel: "recommended stack",
      stackValue: "Next.js · TypeScript · BFF when needed",
      agentsLabel: "execution agents",
      agentsValue: "UI/UX · Frontend · Backend · QA",
      skillsLabel: "conditional skills",
      skillsValue: "platform-crud-ui · security-checklist · qa-web-smoke",
      gateNote: "platform-crud-ui is activated only for administrative CRUD; the other skills depend on the impact detected during preflight.",
      approved: "Stack approved",
      approve: "Approve simulated stack",
      waitingArchitect: "Waiting for Architect",
      progress: "Simulation progress",
      trace: "execution trace",
      idleConsole: "waiting for a file... drop a PDF or start the simulation.",
      generating: "generating...",
      paused: "execution paused · human confirmation required",
      finished: "simulation complete · waiting for human review",
      artifacts: "illustrative artifacts",
      generated: "generated",
      waitingGeneration: "waiting generation",
    },
  },
  es: {
    defaultFileName: "requisitos-proyecto.pdf",
    agents: [
      { id: "po", name: "Agent PO", role: "Lectura de requisitos", model: "reasoning · context" },
      { id: "architect", name: "Agent Architect", role: "Stack Fit Gate", model: "reasoning · tools" },
      { id: "uiux", name: "Agent UI/UX", role: "Reuso de patron visual", model: "reasoning · design system" },
      { id: "engineer", name: "Agent Engineer", role: "Agents, skills y gates", model: "code · repo-aware" },
      { id: "backend", name: "Agent Backend", role: "Servicios y reglas", model: "code · executor" },
      { id: "frontend", name: "Agent Frontend", role: "Interfaz y rutas", model: "code · executor" },
    ],
    discoveryScript: [
      { agent: "po", ms: 450, log: "Documento recibido en el navegador · iniciando lectura simulada..." },
      { agent: "po", ms: 650, log: "Alcance, criterios y preguntas abiertas organizados.", artifact: { label: "backlog.json", value: "alcance · criterios · preguntas abiertas" } },
      { agent: "po", ms: 400, log: "Handoff → Agent Architect" },
      { agent: "architect", ms: 600, log: "Stack Fit Gate: comparando SEO, interactividad, runtime, deploy, pruebas y evolucion." },
      { agent: "architect", ms: 650, log: "Stack, agents y skills recomendados con alternativas rechazadas.", artifact: { label: "stack-fit-gate.md", value: "candidatas · trade-offs · recomendacion" } },
      { agent: "architect", ms: 400, log: "Recomendacion lista · esperando confirmacion humana obligatoria." },
    ],
    executionScript: [
      { agent: "human-gate", ms: 250, log: "Stack y plan de ejecucion aprobados para esta simulacion.", artifact: { label: "human-decision.json", value: "decision · responsable · contexto" } },
      { agent: "uiux", ms: 500, log: "UI/UX: verificando cobertura en app-jboot-identity-admin y platform-crud-ui antes de proponer un patron nuevo." },
      { agent: "uiux", ms: 400, log: "Patron reutilizado del preset · Handoff → Agent Engineer" },
      { agent: "engineer", ms: 500, log: "Cargando PROJECT_CONTRACT, MODULE_CONTRACT e instrucciones del target." },
      { agent: "engineer", ms: 600, log: "Preflight registrado: agents, skills, gates y pruebas equivalentes.", artifact: { label: "execution-preflight.json", value: "target · agents · skills · pruebas" } },
      { agent: "engineer", ms: 500, log: "Skill platform-crud-ui seleccionada solamente si hay CRUD administrativo." },
      { agent: "engineer", ms: 500, log: "Skill security-checklist exigida si endpoints, auth, queries o storage son afectados." },
      { agent: "engineer", ms: 400, log: "Fan-out → Agent Backend + Agent Frontend con skills aplicables" },
      { agent: "backend", ms: 650, log: "Implementando reglas dentro del limite de dominio aprobado.", code: "type Result = { status: 'ok' | 'error'; evidence: string[] };" },
      { agent: "backend", ms: 550, log: "Pruebas automatizadas ejecutadas en el escenario ilustrativo." },
      { agent: "frontend", ms: 600, log: "Aplicando skill de UI seleccionada, tokens, responsividad y accesibilidad." },
      { agent: "frontend", ms: 650, log: "Validaciones tecnicas concluidas en el escenario ilustrativo.", artifact: { label: "validation.json", value: "lint · types · tests · build" } },
      { agent: "frontend", ms: 450, log: "Entrega preparada para revision humana.", artifact: { label: "review-gate.md", value: "evidencias · riesgos · aprobacion pendiente" } },
    ],
    ui: {
      dragPrompt: "Arrastra aqui un PDF de requisitos",
      privacyNote: "simulacion · ningun archivo se envia",
      rerun: "Ejecutar otra vez",
      run: "Ejecutar simulacion",
      status: { idle: "-", queued: "fila", running: "activo", done: "ok" },
      gateTitle: "Recomendacion para confirmacion humana",
      gateStatus: { idle: "no iniciado", evaluating: "en analisis", waiting: "esperando por ti", approved: "aprobado" },
      deliveryLabel: "entrega clasificada",
      deliveryValue: "Aplicacion web modular",
      stackLabel: "stack recomendado",
      stackValue: "Next.js · TypeScript · BFF cuando sea necesario",
      agentsLabel: "agents de ejecucion",
      agentsValue: "UI/UX · Frontend · Backend · QA",
      skillsLabel: "skills por condicion",
      skillsValue: "platform-crud-ui · security-checklist · qa-web-smoke",
      gateNote: "platform-crud-ui solo se activa para CRUD administrativo; las demas skills dependen del impacto detectado en el preflight.",
      approved: "Stack aprobado",
      approve: "Aprobar stack simulado",
      waitingArchitect: "Esperando Architect",
      progress: "Progreso de la simulacion",
      trace: "trace de ejecucion",
      idleConsole: "esperando archivo... suelta un PDF o inicia la simulacion.",
      generating: "generando...",
      paused: "ejecucion pausada · confirmacion humana necesaria",
      finished: "simulacion concluida · esperando revision humana",
      artifacts: "artefactos ilustrativos",
      generated: "generado",
      waitingGeneration: "esperando generacion",
    },
  },
} satisfies Record<PipelineLocale, {
  defaultFileName: string;
  agents: AgentDefinition[];
  discoveryScript: Step[];
  executionScript: Step[];
  ui: {
    dragPrompt: string;
    privacyNote: string;
    rerun: string;
    run: string;
    status: Record<Status, string>;
    gateTitle: string;
    gateStatus: Record<"idle" | "evaluating" | "waiting" | "approved", string>;
    deliveryLabel: string;
    deliveryValue: string;
    stackLabel: string;
    stackValue: string;
    agentsLabel: string;
    agentsValue: string;
    skillsLabel: string;
    skillsValue: string;
    gateNote: string;
    approved: string;
    approve: string;
    waitingArchitect: string;
    progress: string;
    trace: string;
    idleConsole: string;
    generating: string;
    paused: string;
    finished: string;
    artifacts: string;
    generated: string;
    waitingGeneration: string;
  };
}>;

export function AgentPipeline({
  autoStart = false,
  locale = "pt",
}: {
  autoStart?: boolean;
  locale?: PipelineLocale;
}) {
  const copy = pipelineCopy[locale];
  const script: Step[] = [...copy.discoveryScript, ...copy.executionScript];
  const approvalIndex = copy.discoveryScript.length;
  const artifactSteps = script.flatMap((step, stepIndex) =>
    step.artifact ? [{ ...step.artifact, stepIndex }] : [],
  );
  const totalMs = script.reduce((total, step) => total + step.ms, 0);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [waitingApproval, setWaitingApproval] = useState(false);
  const [approved, setApproved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState(copy.defaultFileName);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const schedule = useCallback((startIndex: number, steps: Step[], onComplete?: () => void) => {
    let elapsed = 0;
    steps.forEach((step, offset) => {
      elapsed += step.ms;
      timers.current.push(setTimeout(() => setIndex(startIndex + offset + 1), elapsed));
    });
    if (onComplete) timers.current.push(setTimeout(onComplete, elapsed + 20));
  }, []);

  const run = useCallback((name?: string) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (name) setFileName(name);
    setIndex(0);
    setApproved(false);
    setWaitingApproval(false);
    setStarted(true);
    schedule(0, copy.discoveryScript, () => setWaitingApproval(true));
  }, [copy.discoveryScript, schedule]);

  const approveAndContinue = useCallback(() => {
    if (!waitingApproval) return;
    setWaitingApproval(false);
    setApproved(true);
    schedule(approvalIndex, copy.executionScript);
  }, [approvalIndex, copy.executionScript, schedule, waitingApproval]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!autoStart || started || !rootRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        run();
      }
    }, { threshold: 0.3 });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [autoStart, run, started]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [index, waitingApproval]);

  const visible = script.slice(0, index);
  const current = started && !waitingApproval && index < script.length ? script[index] : null;
  const finished = approved && index >= script.length;
  const progress = started
    ? Math.min(100, (visible.reduce((total, step) => total + step.ms, 0) / totalMs) * 100)
    : 0;
  const gateStatus = !started ? "idle" : approved ? "approved" : waitingApproval ? "waiting" : "evaluating";

  const statusOf = (agentId: AgentId): Status => {
    if (!started) return "idle";
    const first = script.findIndex(step => step.agent === agentId);
    const last = script.map(step => step.agent).lastIndexOf(agentId);
    if (index > last) return "done";
    if (index >= first) return "running";
    return "queued";
  };

  return (
    <div className="ai-pipeline" ref={rootRef}>
      <div className="ai-pipeline__top">
        <div className={`ai-dropzone${dragging ? " is-dragging" : ""}`}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); run(event.dataTransfer.files?.[0]?.name); }}>
          <div className="ai-circuit-grid" aria-hidden="true" />
          <div className="ai-dropzone__content">
            <span className="ai-file-icon">PDF</span>
            <strong>{started ? fileName : copy.ui.dragPrompt}</strong>
            <small>{copy.ui.privacyNote}</small>
            <button type="button" onClick={() => run()}>{started ? copy.ui.rerun : copy.ui.run}</button>
          </div>
        </div>
        <div className="ai-agent-list">
          {copy.agents.map((agent, agentIndex) => {
            const status = statusOf(agent.id);
            return (
              <div className={`ai-agent is-${status}`} key={agent.id}>
                <span className="ai-agent__number">{String(agentIndex + 1).padStart(2, "0")}</span>
                <div><strong>{agent.name}</strong><small>{agent.role}</small></div>
                <code>{agent.model}</code>
                <em>{copy.ui.status[status]}</em>
              </div>
            );
          })}
        </div>
      </div>

      <section className={`ai-approval-gate is-${gateStatus}`} aria-live="polite">
        <header>
          <div><span>Stack Fit Gate</span><strong>{copy.ui.gateTitle}</strong></div>
          <em>{copy.ui.gateStatus[gateStatus]}</em>
        </header>
        <div className="ai-approval-gate__grid">
          <div><small>{copy.ui.deliveryLabel}</small><strong>{copy.ui.deliveryValue}</strong></div>
          <div><small>{copy.ui.stackLabel}</small><strong>{copy.ui.stackValue}</strong></div>
          <div><small>{copy.ui.agentsLabel}</small><strong>{copy.ui.agentsValue}</strong></div>
          <div><small>{copy.ui.skillsLabel}</small><strong>{copy.ui.skillsValue}</strong></div>
        </div>
        <footer>
          <p>{copy.ui.gateNote}</p>
          <button type="button" onClick={approveAndContinue} disabled={!waitingApproval}>
            {approved ? copy.ui.approved : waitingApproval ? copy.ui.approve : copy.ui.waitingArchitect}
          </button>
        </footer>
      </section>

      <div className="ai-progress" aria-label={`${copy.ui.progress}: ${Math.round(progress)}%`}><span style={{ width: `${progress}%` }} /></div>
      <div className="ai-pipeline__output">
        <div className="ai-console">
          <div className="ai-console__header"><span>{copy.ui.trace}</span><span>{visible.length}/{script.length}</span></div>
          <div className="ai-console__log" ref={logRef} aria-live="polite">
            {!started && <p>{copy.ui.idleConsole}</p>}
            {visible.map((step, stepIndex) => (
              <div className="ai-log-entry" key={`${step.agent}-${stepIndex}`}>
                <span>[{step.agent}]</span><div>{step.log}{step.code && <pre>{step.code}</pre>}</div>
              </div>
            ))}
            {current && <div className="ai-log-entry is-current"><span>[{current.agent}]</span><div>{copy.ui.generating}</div></div>}
            {waitingApproval && <div className="ai-console__gate">◆ {copy.ui.paused}</div>}
            {finished && <div className="ai-console__done">✓ {copy.ui.finished}</div>}
          </div>
        </div>
        <div className="ai-artifacts" aria-live="polite">
          <h3>{copy.ui.artifacts}</h3>
          {artifactSteps.map(artifact => {
            const completed = index > artifact.stepIndex;
            return (
              <article className={`ai-artifact${completed ? " is-complete" : ""}`} key={artifact.label}
                aria-label={`${artifact.label}: ${completed ? copy.ui.generated : copy.ui.waitingGeneration}`}>
                <div className="ai-artifact__copy"><strong>{artifact.label}</strong><span>{artifact.value}</span></div>
                <span className="ai-artifact__check" aria-hidden="true">✓</span>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
