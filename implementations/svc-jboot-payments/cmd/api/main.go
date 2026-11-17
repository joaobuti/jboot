package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jboot-platform/svc-jboot-payments/internal/adapters/httpapi"
	"github.com/jboot-platform/svc-jboot-payments/internal/adapters/infinitepay"
	"github.com/jboot-platform/svc-jboot-payments/internal/adapters/postgres"
	"github.com/jboot-platform/svc-jboot-payments/internal/application"
	"github.com/jboot-platform/svc-jboot-payments/internal/config"
	"github.com/jboot-platform/svc-jboot-payments/internal/platform/telemetry"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration_invalid", "error", err.Error())
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	shutdownTelemetry, err := telemetry.Setup(ctx, "svc-jboot-payments", cfg.OTLPEndpoint)
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
	auth := httpapi.NewAuthenticator(cfg.JWTSecret, cfg.Issuer, cfg.Audience, cfg.AllowedCallers)
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.NewRouter(service, store, auth, logger),
		ReadHeaderTimeout: 2 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}

	go func() {
		logger.Info("payments_api_started", "port", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("payments_api_failed", "error", err.Error())
			stop()
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("payments_api_shutdown_failed", "error", err.Error())
	}
}
