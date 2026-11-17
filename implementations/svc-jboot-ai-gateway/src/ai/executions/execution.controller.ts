import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentServiceAuth } from "../../auth/service-auth-context";
import {
  ServiceAuthContext,
  ServiceAuthGuard,
} from "../../auth/service-auth.guard";
import { CreateExecutionDto } from "./execution.dto";
import { ExecutionService } from "./execution.service";

@ApiTags("executions")
@ApiBearerAuth()
@UseGuards(ServiceAuthGuard)
@Controller("v1/executions")
export class ExecutionController {
  constructor(private readonly service: ExecutionService) {}
  @Post() @HttpCode(HttpStatus.ACCEPTED) execute(
    @CurrentServiceAuth() auth: ServiceAuthContext,
    @Headers("idempotency-key") key: string,
    @Body() body: CreateExecutionDto,
  ) {
    if (!key || key.length < 8 || key.length > 160)
      throw new UnauthorizedException("Valid idempotency key required");
    if (
      auth.clientId !== body.clientId ||
      auth.applicationSlug !== body.applicationSlug
    )
      throw new UnauthorizedException("Service context mismatch");
    return this.service.execute(body, key);
  }
  @Get(":executionId") get(
    @CurrentServiceAuth() auth: ServiceAuthContext,
    @Param("executionId", ParseUUIDPipe) id: string,
  ) {
    return this.service.get(id, auth.clientId, auth.applicationSlug);
  }
}
