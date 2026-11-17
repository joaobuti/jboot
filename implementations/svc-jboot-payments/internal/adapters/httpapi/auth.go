package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type contextKey string

const (
	tenantKey contextKey = "tenant"
	callerKey contextKey = "caller"
)

type serviceClaims struct {
	Type     string `json:"typ"`
	ClientID string `json:"client_id"`
	jwt.RegisteredClaims
}

type Authenticator struct {
	secret         []byte
	issuer         string
	audience       string
	allowedCallers map[string]struct{}
}

func NewAuthenticator(secret, issuer, audience string, callers map[string]struct{}) *Authenticator {
	return &Authenticator{
		secret: []byte(secret), issuer: issuer, audience: audience,
		allowedCallers: callers,
	}
}

func (auth *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		claims, err := auth.parseBearer(request.Header.Get("Authorization"))
		if err != nil {
			writeProblem(response, request, http.StatusUnauthorized, "unauthorized", "Invalid service bearer token")
			return
		}
		if claims.Type != "service_access" {
			writeProblem(response, request, http.StatusUnauthorized, "unauthorized", "Invalid service token type")
			return
		}
		caller := claims.ClientID
		if caller == "" {
			caller = claims.Subject
		}
		if _, allowed := auth.allowedCallers[caller]; !allowed {
			writeProblem(response, request, http.StatusForbidden, "forbidden", "Service caller is not allowed")
			return
		}
		tenantID, err := uuid.Parse(request.Header.Get("X-JBoot-Client-Id"))
		if err != nil || tenantID == uuid.Nil {
			writeProblem(response, request, http.StatusBadRequest, "invalid_tenant", "Valid tenant header is required")
			return
		}
		ctx := context.WithValue(request.Context(), tenantKey, tenantID)
		ctx = context.WithValue(ctx, callerKey, caller)
		next.ServeHTTP(response, request.WithContext(ctx))
	})
}

func (auth *Authenticator) parseBearer(header string) (*serviceClaims, error) {
	raw := strings.TrimPrefix(header, "Bearer ")
	claims := &serviceClaims{}
	token, err := jwt.ParseWithClaims(
		raw,
		claims,
		func(token *jwt.Token) (any, error) { return auth.secret, nil },
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithIssuer(auth.issuer),
		jwt.WithAudience(auth.audience),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}

func tenantFrom(ctx context.Context) uuid.UUID {
	id, _ := ctx.Value(tenantKey).(uuid.UUID)
	return id
}
