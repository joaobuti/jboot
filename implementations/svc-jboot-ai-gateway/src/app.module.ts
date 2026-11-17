import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppConfigService } from "./config/app-config.service";
import { DatabaseService } from "./database/database.service";
import { HealthController } from "./health/health.controller";
import { UserAuthGuard } from "./auth/user-auth.guard";
import { ProviderCatalog } from "./ai/providers/provider-catalog";
import { ProviderController } from "./ai/providers/provider.controller";
import { CredentialCryptoService } from "./ai/crypto/credential-crypto.service";
import { CredentialRepository } from "./ai/credentials/credential.repository";
import { CredentialService } from "./ai/credentials/credential.service";
import { CredentialController } from "./ai/credentials/credential.controller";
import { AgentController } from "./ai/agents/agent.controller";
import { AgentService } from "./ai/agents/agent.service";
import { AgentRepository } from "./ai/agents/agent.repository";
import { AgentPromptCryptoService } from "./ai/crypto/agent-prompt-crypto.service";
import { ExecutionController } from "./ai/executions/execution.controller";
import { ExecutionRepository } from "./ai/executions/execution.repository";
import { ExecutionService } from "./ai/executions/execution.service";
import { AnthropicProviderAdapter } from "./ai/providers/anthropic-provider.adapter";
import { ServiceAuthGuard } from "./auth/service-auth.guard";
import { AnthropicExecutionAdapter } from './ai/providers/anthropic-execution.adapter';
import { OpenAIProviderAdapter } from './ai/providers/openai-provider.adapter';
import { OpenAIExecutionAdapter } from './ai/providers/openai-execution.adapter';
import { ProviderRegistry } from './ai/providers/provider-registry';
import { ClaudeRoutineFireAdapter } from './ai/providers/claude-routine-fire.adapter';
import { InteractionController } from './ai/interactions/interaction.controller';
import { ToolCatalog } from './ai/tools/tool-catalog';
import { ToolController } from './ai/tools/tool.controller';
import { ExecutionToolCallsCryptoService } from './ai/crypto/execution-tool-calls-crypto.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  controllers: [
    HealthController,
    ProviderController,
    CredentialController,
    AgentController,
    InteractionController,
    ExecutionController,
    ToolController,
  ],
  providers: [
    AppConfigService,
    DatabaseService,
    ClaudeRoutineFireAdapter,
    UserAuthGuard,
    ServiceAuthGuard,
    ProviderCatalog,
    AnthropicProviderAdapter,
    AnthropicExecutionAdapter,
    OpenAIProviderAdapter,
    OpenAIExecutionAdapter,
    ProviderRegistry,
    ToolCatalog,
    ExecutionToolCallsCryptoService,
    CredentialCryptoService,
    CredentialRepository,
    CredentialService,
    AgentPromptCryptoService,
    AgentRepository,
    AgentService,
    ExecutionRepository,
    ExecutionService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
