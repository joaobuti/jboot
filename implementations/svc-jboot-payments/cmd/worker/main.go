package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jboot-platform/svc-jboot-payments/internal/adapters/infinitepay"
	"github.com/jboot-platform/svc-jboot-payments/internal/adapters/postgres"
	"github.com/jboot-platform/svc-jboot-payments/internal/application"
	"github.com/jboot-platform/svc-jboot-payments/internal/config"
	"github.com/jboot-platform/svc-jboot-payments/internal/platform/telemetry"
	"go.opentelemetry.io/otel"
)

var outboxPublishedCounter, _ = otel.Meter("svc-jboot-payments/worker").Int64Counter(
	"payments.outbox.published",
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration_invalid", "error", err.Error())
		os.Exit(1)
	}
	if cfg.OutboxMode != "log" {
		logger.Error("outbox_mode_unsupported", "mode", cfg.OutboxMode)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	shutdownTelemetry, err := telemetry.Setup(ctx, "svc-jboot-payments-worker", cfg.OTLPEndpoint)
	if err != nil {
		logger.Error("telemetry_setup_failed", "error", err.Error())
		os.Exit(1)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdownTelemetry(shutdownCtx)
	}()
	store, err := postgres.Open(ctx, cfg.DatabaseURL, cfg.IdentityDatabaseURL)
	if err != nil {
		logger.Error("database_open_failed", "error", err.Error())
		os.Exit(1)
	}
	defer store.Close()
	if err := store.Migrate(ctx); err != nil {
		logger.Error("migration_failed", "error", err.Error())
		os.Exit(1)
	}
	provider, err := infinitepay.NewClient(cfg.InfinitePayBaseURL, cfg.PublicBaseURL, cfg.ProviderTimeout)
	if err != nil {
		logger.Error("provider_configuration_invalid", "error", err.Error())
		os.Exit(1)
	}
	service := application.NewService(store, store, provider)
	workerID := "payments-worker-" + uuid.NewString()
	logger.Info("payments_worker_started", "worker_id", workerID, "mode", cfg.OutboxMode)
	for {
		if err := dispatchOnce(ctx, store, workerID, logger); err != nil {
			logger.Error("outbox_dispatch_failed", "error", err.Error())
		}
		if count, err := service.ReconcileDue(ctx, workerID, 50); err != nil {
			logger.Error("reconciliation_failed", "error", err.Error())
		} else if count > 0 {
			logger.Info("reconciliation_processed", "count", count)
		}
		select {
		case <-ctx.Done():
			return
		case <-timeAfter(cfg.WorkerInterval):
		}
	}
}

type outboxStore interface {
	ClaimOutbox(context.Context, string, int) ([]postgres.OutboxEvent, error)
	MarkOutboxPublished(context.Context, uuid.UUID, string) error
	ReleaseOutbox(context.Context, uuid.UUID, string) error
}

func dispatchOnce(ctx context.Context, store outboxStore, workerID string, logger *slog.Logger) error {
	ctx, span := otel.Tracer("svc-jboot-payments/worker").Start(ctx, "outbox.dispatch")
	defer span.End()
	events, err := store.ClaimOutbox(ctx, workerID, 50)
	if err != nil {
		return err
	}
	for _, event := range events {
		logger.InfoContext(ctx, "outbox_event", "event_id", event.ID, "event_type", event.EventType)
		if err := store.MarkOutboxPublished(ctx, event.ID, workerID); err != nil {
			_ = store.ReleaseOutbox(ctx, event.ID, workerID)
			return err
		}
		outboxPublishedCounter.Add(ctx, 1)
	}
	return nil
}

var timeAfter = func(duration time.Duration) <-chan time.Time {
	return time.After(duration)
}
