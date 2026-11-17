package telemetry

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
)

// Regressao (2026-11-14, producao no VPS): com PAYMENTS_OTLP_ENDPOINT definido,
// Setup falhava com "conflicting Schema URL" (semconv fixo diferente do schema
// de resource.Default()) e o servico subia sem telemetria. Alem disso, traces e
// metricas usavam a mesma URL, entao um dos sinais ia para o caminho errado.
// O endpoint e a URL base do OTLP/HTTP; cada sinal usa o caminho padrao.
func TestSetupExportsTracesAndMetricsToStandardPaths(t *testing.T) {
	var mu sync.Mutex
	paths := map[string]int{}
	collector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		paths[r.URL.Path]++
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer collector.Close()

	ctx := context.Background()
	shutdown, err := Setup(ctx, "svc-jboot-payments-test", collector.URL)
	if err != nil {
		t.Fatalf("Setup com endpoint definido nao pode falhar: %v", err)
	}

	_, span := otel.Tracer("telemetry-test").Start(ctx, "regression")
	span.End()
	counter, err := otel.Meter("telemetry-test").Int64Counter("regression_total")
	if err != nil {
		t.Fatalf("criar contador: %v", err)
	}
	counter.Add(ctx, 1)

	shutdownCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := shutdown(shutdownCtx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if paths["/v1/traces"] == 0 {
		t.Errorf("nenhum trace exportado em /v1/traces; caminhos recebidos: %v", paths)
	}
	if paths["/v1/metrics"] == 0 {
		t.Errorf("nenhuma metrica exportada em /v1/metrics; caminhos recebidos: %v", paths)
	}
}

func TestSetupWithoutEndpointIsNoop(t *testing.T) {
	shutdown, err := Setup(context.Background(), "svc-jboot-payments-test", "")
	if err != nil {
		t.Fatalf("Setup sem endpoint: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown sem endpoint: %v", err)
	}
}
