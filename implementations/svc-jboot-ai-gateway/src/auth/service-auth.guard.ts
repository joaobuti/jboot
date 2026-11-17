import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { jwtVerify } from "jose";
import { AppConfigService } from "../config/app-config.service";

export interface ServiceAuthContext {
  callerId: string;
  clientId: string;
  applicationSlug: string;
}

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{
        headers: Record<string, string | undefined>;
        serviceAuth?: ServiceAuthContext;
      }>();
    const supplied = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!supplied) throw new UnauthorizedException("Bearer token required");
    let payload;
    try {
      ({ payload } = await jwtVerify(
        supplied,
        new TextEncoder().encode(this.config.identityJwtSecret),
        {
          issuer: this.config.identityIssuer,
          audience: this.config.serviceAudience,
        },
      ));
    } catch {
      throw new UnauthorizedException("Invalid service token");
    }
    const callerId =
      typeof payload.sub === "string" && payload.sub === payload.client_id
        ? payload.sub
        : undefined;
    if (
      payload.typ !== "service_access" ||
      !callerId ||
      !this.config.serviceCallerAllowlist.has(callerId)
    )
      throw new UnauthorizedException("Invalid service principal");
    const clientId = request.headers["x-jboot-client-id"];
    const applicationSlug = request.headers["x-jboot-application-slug"];
    if (!clientId || !applicationSlug)
      throw new UnauthorizedException("Service context required");
    request.serviceAuth = { callerId, clientId, applicationSlug };
    return true;
  }
}
