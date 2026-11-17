import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthContext, CurrentAuth } from '../../auth/auth-context';
import { RequiredScopes } from '../../auth/required-scopes.decorator';
import { UserAuthGuard } from '../../auth/user-auth.guard';
import { ExecutionService } from '../executions/execution.service';
import { CreateInteractionDto } from './interaction.dto';

@ApiTags('interactions')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@RequiredScopes('ai:execute')
@Controller('v1/interactions')
export class InteractionController {
  constructor(private readonly executions: ExecutionService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  interact(
    @CurrentAuth() auth: AuthContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreateInteractionDto,
  ) {
    if (!key || key !== body.requestId) {
      throw new BadRequestException('requestId must match Idempotency-Key');
    }
    return this.executions.interact(auth, body, key);
  }
}
