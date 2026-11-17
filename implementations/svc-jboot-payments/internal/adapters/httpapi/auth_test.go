package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestAuthenticatorRequiresAudienceTypeCallerAndTenant(t *testing.T) {
	auth := NewAuthenticator("secret", "jboot-identity", "svc:payments", map[string]struct{}{"platform-api": {}})
	handler := auth.Middleware(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if tenantFrom(request.Context()) == uuid.Nil {
			t.Fatal("tenant was not propagated")
		}
		response.WriteHeader(http.StatusNoContent)
	}))

	request := httptest.NewRequest(http.MethodGet, "/v1/charges/any", nil)
	request.Header.Set("Authorization", "Bearer "+signedToken(t, "svc:payments", "platform-api", "service_access"))
	request.Header.Set("X-JBoot-Client-Id", uuid.NewString())
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", response.Code)
	}

	request = httptest.NewRequest(http.MethodGet, "/v1/charges/any", nil)
	request.Header.Set("Authorization", "Bearer "+signedToken(t, "svc:other", "platform-api", "service_access"))
	request.Header.Set("X-JBoot-Client-Id", uuid.NewString())
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("wrong audience must be rejected, got %d", response.Code)
	}

	tests := []struct {
		name       string
		audience   string
		caller     string
		tokenType  string
		tenant     string
		wantStatus int
	}{
		{"wrong token type", "svc:payments", "platform-api", "access", uuid.NewString(), http.StatusUnauthorized},
		{"caller outside allowlist", "svc:payments", "unknown-api", "service_access", uuid.NewString(), http.StatusForbidden},
		{"missing tenant", "svc:payments", "platform-api", "service_access", "", http.StatusBadRequest},
		{"invalid tenant", "svc:payments", "platform-api", "service_access", "not-a-uuid", http.StatusBadRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/v1/charges/any", nil)
			request.Header.Set("Authorization", "Bearer "+signedToken(t, test.audience, test.caller, test.tokenType))
			if test.tenant != "" {
				request.Header.Set("X-JBoot-Client-Id", test.tenant)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("expected %d, got %d", test.wantStatus, response.Code)
			}
		})
	}
}

func signedToken(t *testing.T, audience, caller, tokenType string) string {
	t.Helper()
	claims := serviceClaims{
		Type: tokenType, ClientID: caller,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "jboot-identity", Subject: caller,
			Audience:  jwt.ClaimStrings{audience},
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Second)),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("secret"))
	if err != nil {
		t.Fatal(err)
	}
	return token
}
