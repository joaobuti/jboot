import { Injectable } from "@nestjs/common";

const csv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const modelList = (value: string | undefined, fallback: string[]): string[] => {
  const configured = csv(value);
  return configured.length > 0 ? configured : fallback;
};

export type AiResponseMode = "text" | "json_schema";

@Injectable()
export class AppConfigService {
  readonly aiExecutionEnabled =
    process.env.AI_GATEWAY_EXECUTION_ENABLED === "true";
  readonly enabledProviders = new Set(
    csv(process.env.AI_GATEWAY_ENABLED_PROVIDERS ?? "openai"),
  );
  readonly openaiAllowedModels = csv(
    process.env.AI_GATEWAY_OPENAI_ALLOWED_MODELS,
  );
  readonly anthropicAllowedModels = csv(
    process.env.AI_GATEWAY_ANTHROPIC_ALLOWED_MODELS,
  );
  readonly openaiTextModels = modelList(
    process.env.AI_GATEWAY_OPENAI_TEXT_MODELS,
    this.openaiAllowedModels,
  );
  readonly openaiStructuredModels = modelList(
    process.env.AI_GATEWAY_OPENAI_STRUCTURED_MODELS,
    this.openaiAllowedModels,
  );
  readonly anthropicTextModels = modelList(
    process.env.AI_GATEWAY_ANTHROPIC_TEXT_MODELS,
    this.anthropicAllowedModels,
  );
  readonly anthropicStructuredModels = modelList(
    process.env.AI_GATEWAY_ANTHROPIC_STRUCTURED_MODELS,
    this.anthropicAllowedModels,
  );
  readonly port = Number(process.env.PORT ?? 8050);
  readonly databaseUrl =
    process.env.AI_GATEWAY_DATABASE_URL ??
    "postgresql://jboot:jboot@postgres:5432/jboot_ai_gateway";
  readonly identityJwtSecret =
    process.env.JBOOT_IDENTITY_JWT_SECRET ??
    "dev-only-jboot-identity-secret-change-before-production";
  readonly identityIssuer =
    process.env.JBOOT_IDENTITY_ISSUER ?? "jboot-identity";
  readonly serviceAudience =
    process.env.AI_GATEWAY_SERVICE_AUDIENCE ?? "svc:ai-gateway";
  readonly serviceCallerAllowlist = new Set(
    csv(process.env.AI_GATEWAY_CALLER_ALLOWLIST ?? "platform-api"),
  );
  readonly encryptionKeyVersion = Number(
    process.env.AI_GATEWAY_ENCRYPTION_KEY_VERSION ?? 1,
  );

  isProviderEnabled(provider: string): boolean {
    return this.enabledProviders.has(provider);
  }

  modelCapabilities(provider: string, model: string): string[] {
    const allowed =
      provider === "openai"
        ? this.openaiAllowedModels
        : provider === "anthropic"
          ? this.anthropicAllowedModels
          : [];
    if (!allowed.includes(model)) return [];
    const text =
      provider === "openai"
        ? this.openaiTextModels
        : provider === "anthropic"
          ? this.anthropicTextModels
          : [];
    const structured =
      provider === "openai"
        ? this.openaiStructuredModels
        : provider === "anthropic"
          ? this.anthropicStructuredModels
          : [];
    return [
      ...(text.includes(model) ? ["text-output"] : []),
      ...(structured.includes(model) ? ["structured-output"] : []),
    ];
  }

  isModelAllowed(
    provider: string,
    model: string,
    responseMode: AiResponseMode,
  ): boolean {
    const capability =
      responseMode === "text" ? "text-output" : "structured-output";
    return this.modelCapabilities(provider, model).includes(capability);
  }

  encryptionKey(): Buffer {
    const encoded = process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64;
    if (!encoded)
      throw new Error("AI_GATEWAY_ENCRYPTION_KEY_BASE64 is required");
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32)
      throw new Error(
        "AI_GATEWAY_ENCRYPTION_KEY_BASE64 must decode to 32 bytes",
      );
    return key;
  }
}
