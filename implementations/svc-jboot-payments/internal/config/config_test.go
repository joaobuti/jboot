package config

import (
	"strings"
	"testing"
)

func TestProductionRejectsInsecurePublicCallbackURL(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("PAYMENTS_ENVIRONMENT", "production")
	t.Setenv("PAYMENTS_PUBLIC_BASE_URL", "http://localhost:8040")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "PAYMENTS_PUBLIC_BASE_URL") {
		t.Fatalf("expected insecure callback URL to fail closed, got %v", err)
	}
}

func TestProductionAcceptsPublicHTTPSAndOfficialProvider(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("PAYMENTS_ENVIRONMENT", "production")
	t.Setenv("PAYMENTS_PUBLIC_BASE_URL", "https://payments.example.com")
	t.Setenv("PAYMENTS_INFINITEPAY_BASE_URL", "https://api.checkout.infinitepay.io")

	config, err := Load()
	if err != nil {
		t.Fatalf("expected valid production configuration, got %v", err)
	}
	if config.Environment != "production" {
		t.Fatalf("unexpected environment %q", config.Environment)
	}
}

func setRequiredEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("PAYMENTS_DATABASE_URL", "postgres://payments")
	t.Setenv("PAYMENTS_IDENTITY_DATABASE_URL", "postgres://identity")
	t.Setenv("PAYMENTS_IDENTITY_JWT_SECRET", "0123456789abcdef0123456789abcdef")
}
