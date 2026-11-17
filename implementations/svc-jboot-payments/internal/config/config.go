package config

import (
	"errors"
	"net"
	"net/url"
	"os"
	"strings"
	"time"
)

type Config struct {
	Environment         string
	Port                string
	DatabaseURL         string
	IdentityDatabaseURL string
	JWTSecret           string
	Issuer              string
	Audience            string
	AllowedCallers      map[string]struct{}
	OTLPEndpoint        string
	OutboxMode          string
	WorkerInterval      time.Duration
	InfinitePayBaseURL  string
	PublicBaseURL       string
	ProviderTimeout     time.Duration
}

func Load() (Config, error) {
	interval, err := time.ParseDuration(env("PAYMENTS_WORKER_INTERVAL", "2s"))
	if err != nil || interval < time.Second {
		return Config{}, errors.New("PAYMENTS_WORKER_INTERVAL must be at least 1s")
	}
	providerTimeout, err := time.ParseDuration(env("PAYMENTS_PROVIDER_TIMEOUT", "8s"))
	if err != nil || providerTimeout < time.Second || providerTimeout > 15*time.Second {
		return Config{}, errors.New("PAYMENTS_PROVIDER_TIMEOUT must be between 1s and 15s")
	}
	cfg := Config{
		Environment:         env("PAYMENTS_ENVIRONMENT", "development"),
		Port:                env("PAYMENTS_PORT", "8040"),
		DatabaseURL:         os.Getenv("PAYMENTS_DATABASE_URL"),
		IdentityDatabaseURL: os.Getenv("PAYMENTS_IDENTITY_DATABASE_URL"),
		JWTSecret:           os.Getenv("PAYMENTS_IDENTITY_JWT_SECRET"),
		Issuer:              env("PAYMENTS_IDENTITY_ISSUER", "jboot-identity"),
		Audience:            env("PAYMENTS_SERVICE_AUDIENCE", "svc:payments"),
		AllowedCallers:      splitSet(env("PAYMENTS_CALLER_ALLOWLIST", "platform-api")),
		OTLPEndpoint:        os.Getenv("PAYMENTS_OTLP_ENDPOINT"),
		OutboxMode:          env("PAYMENTS_OUTBOX_MODE", "log"),
		WorkerInterval:      interval,
		InfinitePayBaseURL:  env("PAYMENTS_INFINITEPAY_BASE_URL", "https://api.checkout.infinitepay.io"),
		PublicBaseURL:       env("PAYMENTS_PUBLIC_BASE_URL", "http://localhost:8040"),
		ProviderTimeout:     providerTimeout,
	}
	if cfg.DatabaseURL == "" || cfg.IdentityDatabaseURL == "" || cfg.JWTSecret == "" {
		return Config{}, errors.New("payments database, identity database and JWT secret are required")
	}
	if len(cfg.AllowedCallers) == 0 {
		return Config{}, errors.New("at least one service caller must be allowlisted")
	}
	if cfg.Environment == "production" {
		if err := validateProductionURL("PAYMENTS_PUBLIC_BASE_URL", cfg.PublicBaseURL, false); err != nil {
			return Config{}, err
		}
		if err := validateProductionURL("PAYMENTS_INFINITEPAY_BASE_URL", cfg.InfinitePayBaseURL, true); err != nil {
			return Config{}, err
		}
		if len(cfg.JWTSecret) < 32 {
			return Config{}, errors.New("PAYMENTS_IDENTITY_JWT_SECRET must have at least 32 characters in production")
		}
	}
	return cfg, nil
}

func validateProductionURL(name, raw string, allowOfficialInfinitePayOnly bool) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" {
		return errors.New(name + " must be an absolute HTTPS URL in production")
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || net.ParseIP(host) != nil {
		return errors.New(name + " must use a public DNS hostname in production")
	}
	if allowOfficialInfinitePayOnly && host != "api.checkout.infinitepay.io" {
		return errors.New(name + " must use the official InfinitePay API hostname in production")
	}
	return nil
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func splitSet(raw string) map[string]struct{} {
	result := make(map[string]struct{})
	for _, item := range strings.Split(raw, ",") {
		if value := strings.TrimSpace(item); value != "" {
			result[value] = struct{}{}
		}
	}
	return result
}
