export type PlatformModuleSlug = "pdv" | "juridico" | "flow";

export interface ModuleSettingContribution {
  id: string;
  label: string;
  icon: string;
  href: (module: PlatformModuleSlug) => string;
  scope: "global" | "module";
  applicationSlug?: PlatformModuleSlug;
  /** Basta uma (lista) para ver o item. */
  requiredScope?: string | readonly string[];
  group?: "ai";
}

const CONTRIBUTIONS: readonly ModuleSettingContribution[] = [
  {
    id: "permissions",
    label: "Permissões",
    icon: "ri-shield-user-line",
    href: (module) => `/${module}/configuracoes/permissoes`,
    scope: "global",
    requiredScope: "users:manage",
  },
  {
    id: "google-drive",
    label: "Google Drive",
    icon: "ri-google-fill",
    href: () => "/flow/configuracoes/google-drive",
    scope: "module",
    applicationSlug: "flow",
    requiredScope: "flow:admin",
  },
  {
    id: "email-dispatches",
    label: "Envios de e-mail",
    icon: "ri-mail-send-line",
    href: () => "/flow/configuracoes/envios-email",
    scope: "module",
    applicationSlug: "flow",
    requiredScope: "flow:admin",
  },
  {
    id: "ai-credentials",
    label: "Credenciais",
    icon: "ri-key-2-line",
    href: () => "/flow/configuracoes/ia/credenciais",
    scope: "module",
    applicationSlug: "flow",
    requiredScope: "ai:credentials:manage",
    group: "ai",
  },
  {
    id: "ai-agents",
    label: "Agentes",
    icon: "ri-robot-2-line",
    href: () => "/flow/configuracoes/ia/agentes",
    scope: "module",
    applicationSlug: "flow",
    requiredScope: "ai:agents:manage",
    group: "ai",
  },
  {
    // Todo usuario do Flow precisa da URL e das proprias conexoes; ligar e so flow:admin (BFF).
    id: "claude-connector",
    label: "Conector Claude",
    icon: "ri-plug-line",
    href: () => "/flow/configuracoes/ia/conector-claude",
    scope: "module",
    applicationSlug: "flow",
    requiredScope: "flow:read",
    group: "ai",
  },
  {
    // Agente que valida a ficha do cliente (ADR 017): admin configura todos; responsavel de escritorio
    // com permissao de IA ve/altera o do seu escritorio (flow-offices-sprints.md, S4).
    id: "customer-validation",
    label: "Validação de cadastro",
    icon: "ri-shield-user-line",
    href: () => "/flow/configuracoes/ia/validacao-cadastro",
    scope: "module",
    applicationSlug: "flow",
    requiredScope: ["flow:admin", "ai:agents:read", "ai:agents:manage"],
    group: "ai",
  },
];

export function moduleSettings(
  module: PlatformModuleSlug,
  scopes: readonly string[],
): ModuleSettingContribution[] {
  return CONTRIBUTIONS.filter(
    (item) =>
      (item.scope === "global" || item.applicationSlug === module) &&
      (!item.requiredScope ||
        (typeof item.requiredScope === "string" ? [item.requiredScope] : item.requiredScope).some((scope) => scopes.includes(scope))),
  );
}

export function canManageModuleUsers(scopes: readonly string[]): boolean {
  return scopes.includes("users:manage");
}
