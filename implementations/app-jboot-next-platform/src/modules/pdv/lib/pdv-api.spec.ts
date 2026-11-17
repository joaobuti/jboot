import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `pdv-api` le `NEXT_PUBLIC_*` no import (API_BASE). Para o teste nao depender do
// ambiente do container, remove as variaveis e reimporta o modulo a cada teste.
let pdvApi: typeof import("./pdv-api").pdvApi;

describe("pdvApi integrated Pix", () => {
  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_JBOOT_PDV_API_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_PDV_API_URL", undefined);
    vi.resetModules();
    ({ pdvApi } = await import("./pdv-api"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("starts the dedicated Pix flow instead of the manual payment endpoint", async () => {
    const payload = {
      chargeId: "charge-1",
      status: "awaiting_payment",
      checkoutUrl: "https://checkout.infinitepay.io/test",
      payment: null,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(pdvApi.sales.initiatePix("sale-1", 10.25)).resolves.toEqual(
      payload,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8010/pdv/sales/sale-1/payments/pix",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ amount: 10.25 }),
      }),
    );
  });

  it("polls the typed verification endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          chargeId: "charge-1",
          status: "received",
          payment: { id: "payment-1" },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    await pdvApi.sales.verifyPix("sale-1", "charge-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8010/pdv/sales/sale-1/payments/pix/charge-1",
      expect.any(Object),
    );
  });

  it("preserves structured problem details without exposing a raw upstream body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Conexão necessária",
          code: "provider_connection_required",
          requestId: "rid",
        }),
        {
          status: 422,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    );
    await expect(pdvApi.sales.initiatePix("sale-1", 10)).rejects.toMatchObject({
      message: "Conexão necessária",
      status: 422,
      code: "provider_connection_required",
      requestId: "rid",
    });
  });

  it("requires the explicit administrator validation declaration when configuring InfinitePay", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "verified" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await pdvApi.payments.configureConnection({
      publicIdentifier: "$merchant",
      validationConfirmed: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8010/pdv/payments/provider-connection",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          publicIdentifier: "$merchant",
          validationConfirmed: true,
        }),
      }),
    );
  });

  it("uses the typed audited refund endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "refund-1", status: "requested" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await pdvApi.payments.requestRefund({
      chargeId: "charge-1",
      amountMinor: 100,
      reason: "cliente solicitou",
      idempotencyKey: "refund-key-123",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8010/pdv/payments/refunds",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          chargeId: "charge-1",
          amountMinor: 100,
          reason: "cliente solicitou",
          idempotencyKey: "refund-key-123",
        }),
      }),
    );
  });

  it("loads tenant reconciliation through the BFF", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    await expect(pdvApi.payments.listReconciliation()).resolves.toEqual({
      data: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8010/pdv/payments/reconciliation",
      expect.any(Object),
    );
  });
});
