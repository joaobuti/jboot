package telemetry

import (
	"context"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// Setup liga traces e metricas por OTLP/HTTP. endpoint e a URL base do coletor
// (ex.: http://otel-gateway:4318), como OTEL_EXPORTER_OTLP_ENDPOINT nos demais
// servicos do JBoot; cada sinal usa o caminho padrao (/v1/traces, /v1/metrics).
// Vazio desliga a telemetria.
func Setup(ctx context.Context, serviceName, endpoint string) (func(context.Context) error, error) {
	if endpoint == "" {
		return func(context.Context) error { return nil }, nil
	}
	base := strings.TrimRight(endpoint, "/")
	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(base+"/v1/traces"),
		otlptracehttp.WithTimeout(5*time.Second),
	)
	if err != nil {
		return nil, err
	}
	metricExporter, err := otlpmetrichttp.New(ctx,
		otlpmetrichttp.WithEndpointURL(base+"/v1/metrics"),
		otlpmetrichttp.WithTimeout(5*time.Second),
	)
	if err != nil {
		return nil, err
	}
	// Sem schema proprio: um semconv fixado em versao diferente da usada por
	// resource.Default() faz o Merge falhar com "conflicting Schema URL" e o
	// servico subia sem telemetria (producao, 2026-11-14).
	serviceResource, err := resource.Merge(
		resource.Default(),
		resource.NewSchemaless(attribute.String("service.name", serviceName)),
	)
	if err != nil {
		return nil, err
	}
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(serviceResource),
	)
	meterProvider := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExporter)),
		sdkmetric.WithResource(serviceResource),
	)
	otel.SetTracerProvider(provider)
	otel.SetMeterProvider(meterProvider)
	return func(shutdownContext context.Context) error {
		if err := meterProvider.Shutdown(shutdownContext); err != nil {
			return err
		}
		return provider.Shutdown(shutdownContext)
	}, nil
}
