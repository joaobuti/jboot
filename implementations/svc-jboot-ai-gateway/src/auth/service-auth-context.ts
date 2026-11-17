import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { ServiceAuthContext } from "./service-auth.guard";

export const CurrentServiceAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ServiceAuthContext =>
    context.switchToHttp().getRequest<{ serviceAuth: ServiceAuthContext }>()
      .serviceAuth,
);
