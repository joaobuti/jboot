import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionContext } from "@nestjs/common";
import { SignJWT } from "jose";
import { AppConfigService } from "../config/app-config.service";
import { ServiceAuthGuard } from "./service-auth.guard";

/* eslint-disable @typescript-eslint/no-floating-promises */
const context = (token: string) => {
  const request: { headers: Record<string, string>; serviceAuth?: unknown } = {
    headers: {
      authorization: `Bearer ${token}`,
      "x-jboot-client-id": "11111111-1111-4111-8111-111111111111",
      "x-jboot-application-slug": "flow",
    },
  };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext,
  };
};

const serviceToken = async (
  config: AppConfigService,
  overrides: { audience?: string; callerId?: string; typ?: string } = {},
) => {
  const callerId = overrides.callerId ?? "platform-api";
  return new SignJWT({
    typ: overrides.typ ?? "service_access",
    client_id: callerId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.identityIssuer)
    .setSubject(callerId)
    .setAudience(overrides.audience ?? config.serviceAudience)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(config.identityJwtSecret));
};

test("validates the Identity service token and binds delegated context", async () => {
  const config = new AppConfigService();
  const guard = new ServiceAuthGuard(config);
  const valid = context(await serviceToken(config));
  assert.equal(await guard.canActivate(valid.context), true);
  assert.deepEqual(valid.request.serviceAuth, {
    callerId: "platform-api",
    clientId: "11111111-1111-4111-8111-111111111111",
    applicationSlug: "flow",
  });
  await assert.rejects(
    () => guard.canActivate(context("invalid-token").context),
    /Invalid service token/,
  );
});

test("rejects wrong audience, token type and caller", async () => {
  const config = new AppConfigService();
  const guard = new ServiceAuthGuard(config);
  await assert.rejects(
    () => serviceToken(config, { audience: "svc:payments" }).then((token) => guard.canActivate(context(token).context)),
    /Invalid service token/,
  );
  await assert.rejects(
    () => serviceToken(config, { typ: "access" }).then((token) => guard.canActivate(context(token).context)),
    /Invalid service principal/,
  );
  await assert.rejects(
    () => serviceToken(config, { callerId: "unknown-service" }).then((token) => guard.canActivate(context(token).context)),
    /Invalid service principal/,
  );
});
