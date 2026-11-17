package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jboot-platform/svc-jboot-payments/internal/application"
	"github.com/jboot-platform/svc-jboot-payments/internal/domain"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type HealthStore interface {
	Ping(ctx context.Context) error
}

type Router struct {
	service       *application.Service
	store         HealthStore
	auth          *Authenticator
	logger        *slog.Logger
	publicLimiter *ipRateLimiter
}

func NewRouter(
	service *application.Service,
	store HealthStore,
	auth *Authenticator,
	logger *slog.Logger,
) http.Handler {
	router := &Router{service: service, store: store, auth: auth, logger: logger, publicLimiter: newIPRateLimiter(60, time.Minute)}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", router.health)
	mux.HandleFunc("GET /ready", router.ready)
	mux.Handle("POST /v1/charges", auth.Middleware(http.HandlerFunc(router.createCharge)))
	mux.Handle("GET /v1/charges/{chargeId}", auth.Middleware(http.HandlerFunc(router.getCharge)))
	mux.Handle("POST /v1/charges/{chargeId}/verify", auth.Middleware(http.HandlerFunc(router.verifyCharge)))
	mux.Handle("PUT /v1/provider-connections/infinitepay", auth.Middleware(http.HandlerFunc(router.configureInfinitePay)))
	mux.Handle("GET /v1/provider-connections/infinitepay", auth.Middleware(http.HandlerFunc(router.getInfinitePay)))
	mux.Handle("GET /v1/public/infinitepay/callback/{chargeId}", router.publicLimiter.Middleware(http.HandlerFunc(router.infinitePayCallback)))
	mux.Handle("POST /v1/public/infinitepay/webhook/{chargeId}", router.publicLimiter.Middleware(http.HandlerFunc(router.infinitePayWebhook)))
	mux.Handle("GET /v1/refunds", auth.Middleware(http.HandlerFunc(router.listRefunds)))
	mux.Handle("POST /v1/refunds", auth.Middleware(http.HandlerFunc(router.requestRefund)))
	mux.Handle("POST /v1/refunds/{refundId}/complete", auth.Middleware(http.HandlerFunc(router.completeRefund)))
	mux.Handle("GET /v1/operations/reconciliation", auth.Middleware(http.HandlerFunc(router.listReconciliation)))
	return otelhttp.NewHandler(router.requestMiddleware(mux), "payments-http")
}

func (router *Router) requestMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requestID := strings.TrimSpace(request.Header.Get("X-Request-Id"))
		if requestID == "" {
			requestID = uuid.NewString()
		}
		response.Header().Set("X-Request-Id", requestID)
		ctx := context.WithValue(request.Context(), contextKey("request_id"), requestID)
		started := time.Now()
		next.ServeHTTP(response, request.WithContext(ctx))
		router.logger.InfoContext(ctx, "http_request",
			"method", request.Method, "path", request.URL.Path,
			"duration_ms", time.Since(started).Milliseconds(), "request_id", requestID,
		)
	})
}

func (router *Router) health(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, map[string]string{"status": "ok"})
}

func (router *Router) ready(response http.ResponseWriter, request *http.Request) {
	ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
	defer cancel()
	if err := router.store.Ping(ctx); err != nil {
		writeProblem(response, request, http.StatusServiceUnavailable, "not_ready", "Dependencies are unavailable")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"status": "ok"})
}

type createChargeRequest struct {
	ConsumerApplication    string `json:"consumerApplication"`
	MerchantOrderReference string `json:"merchantOrderReference"`
	AmountMinor            int64  `json:"amountMinor"`
	Currency               string `json:"currency"`
	PaymentMethod          string `json:"paymentMethod"`
}

type chargeResponse struct {
	ID                     uuid.UUID           `json:"id"`
	ConsumerApplication    string              `json:"consumerApplication"`
	MerchantOrderReference string              `json:"merchantOrderReference"`
	AmountMinor            int64               `json:"amountMinor"`
	Currency               string              `json:"currency"`
	Status                 domain.ChargeStatus `json:"status"`
	CreatedAt              time.Time           `json:"createdAt"`
	CheckoutURL            *string             `json:"checkoutUrl,omitempty"`
}

func (router *Router) createCharge(response http.ResponseWriter, request *http.Request) {
	body, err := decodeCreateRequest(response, request)
	if err != nil {
		writeProblem(response, request, http.StatusUnprocessableEntity, "validation_error", "Request body is invalid")
		return
	}
	command := domain.CreateChargeCommand{
		ClientID:               tenantFrom(request.Context()),
		ConsumerApplication:    body.ConsumerApplication,
		MerchantOrderReference: body.MerchantOrderReference,
		AmountMinor:            body.AmountMinor,
		Currency:               body.Currency,
		IdempotencyKey:         request.Header.Get("Idempotency-Key"),
		PaymentMethod:          body.PaymentMethod,
	}
	charge, replay, err := router.service.CreateCharge(request.Context(), command)
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	status := http.StatusCreated
	if replay {
		status = http.StatusOK
	}
	writeJSON(response, status, toChargeResponse(charge))
}

type configureInfinitePayRequest struct {
	PublicIdentifier   string  `json:"publicIdentifier"`
	SecretRef          *string `json:"secretRef,omitempty"`
	ValidationEvidence string  `json:"validationEvidence"`
}

type providerConnectionResponse struct {
	Provider         string     `json:"provider"`
	PublicIdentifier string     `json:"publicIdentifier"`
	Status           string     `json:"status"`
	VerifiedAt       *time.Time `json:"verifiedAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

func (router *Router) configureInfinitePay(response http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(response, request.Body, 8<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var body configureInfinitePayRequest
	if err := decoder.Decode(&body); err != nil {
		writeProblem(response, request, http.StatusUnprocessableEntity, "validation_error", "Provider connection is invalid")
		return
	}
	connection, err := router.service.ConfigureInfinitePay(request.Context(), domain.ConfigureConnectionCommand{
		ClientID: tenantFrom(request.Context()), PublicIdentifier: body.PublicIdentifier,
		SecretRef: body.SecretRef, ValidationEvidence: body.ValidationEvidence,
	})
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	writeJSON(response, http.StatusOK, toConnectionResponse(connection))
}

func (router *Router) getInfinitePay(response http.ResponseWriter, request *http.Request) {
	connection, err := router.service.GetInfinitePayConnection(request.Context(), tenantFrom(request.Context()))
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	writeJSON(response, http.StatusOK, toConnectionResponse(connection))
}

func (router *Router) verifyCharge(response http.ResponseWriter, request *http.Request) {
	chargeID, err := uuid.Parse(request.PathValue("chargeId"))
	if err != nil {
		writeProblem(response, request, http.StatusBadRequest, "invalid_charge_id", "Charge id is invalid")
		return
	}
	charge, err := router.service.VerifyCharge(request.Context(), tenantFrom(request.Context()), chargeID)
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	writeJSON(response, http.StatusOK, toChargeResponse(charge))
}

func (router *Router) infinitePayCallback(response http.ResponseWriter, request *http.Request) {
	chargeID, err := uuid.Parse(request.PathValue("chargeId"))
	if err != nil {
		writeProblem(response, request, http.StatusBadRequest, "invalid_charge_id", "Charge id is invalid")
		return
	}
	signal := domain.CallbackSignal{
		ChargeID: chargeID, OrderNSU: request.URL.Query().Get("order_nsu"),
		TransactionNSU: request.URL.Query().Get("transaction_nsu"),
		Slug:           request.URL.Query().Get("slug"), CaptureMethod: request.URL.Query().Get("capture_method"),
		ReceiptURL: request.URL.Query().Get("receipt_url"),
	}
	charge, err := router.service.RecordInfinitePayCallback(request.Context(), signal)
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	response.Header().Set("Content-Type", "text/html; charset=utf-8")
	response.WriteHeader(http.StatusOK)
	_, _ = response.Write([]byte("<!doctype html><html><body><p>Pagamento recebido. Voce pode voltar ao PDV.</p><p>Status: " + string(charge.Status) + "</p></body></html>"))
}

type infinitePayWebhookRequest struct {
	InvoiceSlug    string          `json:"invoice_slug"`
	Amount         int64           `json:"amount"`
	PaidAmount     int64           `json:"paid_amount"`
	Installments   int             `json:"installments"`
	CaptureMethod  string          `json:"capture_method"`
	TransactionNSU string          `json:"transaction_nsu"`
	OrderNSU       string          `json:"order_nsu"`
	ReceiptURL     string          `json:"receipt_url"`
	Items          json.RawMessage `json:"items"`
}

func (router *Router) infinitePayWebhook(response http.ResponseWriter, request *http.Request) {
	chargeID, err := uuid.Parse(request.PathValue("chargeId"))
	if err != nil {
		writeProblem(response, request, http.StatusBadRequest, "invalid_charge_id", "Charge id is invalid")
		return
	}
	request.Body = http.MaxBytesReader(response, request.Body, 32<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var body infinitePayWebhookRequest
	if err := decoder.Decode(&body); err != nil {
		writeProblem(response, request, http.StatusBadRequest, "invalid_webhook", "Webhook signal is invalid")
		return
	}
	_, err = router.service.RecordInfinitePayCallback(request.Context(), domain.CallbackSignal{
		ChargeID: chargeID, OrderNSU: body.OrderNSU, TransactionNSU: body.TransactionNSU,
		Slug: body.InvoiceSlug, CaptureMethod: body.CaptureMethod, ReceiptURL: body.ReceiptURL,
		AmountMinor: body.Amount, PaidAmount: body.PaidAmount, Installments: body.Installments,
	})
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"success": true, "message": nil})
}

type requestRefundBody struct {
	ChargeID    uuid.UUID `json:"chargeId"`
	AmountMinor int64     `json:"amountMinor"`
	Reason      string    `json:"reason"`
}
type completeRefundBody struct {
	Succeeded      bool   `json:"succeeded"`
	ResolutionNote string `json:"resolutionNote"`
}

type refundResponse struct {
	ID                 uuid.UUID  `json:"id"`
	ChargeID           uuid.UUID  `json:"chargeId"`
	AmountMinor        int64      `json:"amountMinor"`
	Status             string     `json:"status"`
	Reason             string     `json:"reason"`
	OperatorIdentityID uuid.UUID  `json:"operatorIdentityId"`
	ResolutionNote     *string    `json:"resolutionNote,omitempty"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
	CompletedAt        *time.Time `json:"completedAt,omitempty"`
}

func (router *Router) requestRefund(response http.ResponseWriter, request *http.Request) {
	operatorID, err := uuid.Parse(request.Header.Get("X-JBoot-Operator-Id"))
	if err != nil {
		writeProblem(response, request, http.StatusBadRequest, "invalid_operator", "Valid operator header is required")
		return
	}
	request.Body = http.MaxBytesReader(response, request.Body, 8<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var body requestRefundBody
	if err := decoder.Decode(&body); err != nil {
		writeProblem(response, request, http.StatusUnprocessableEntity, "validation_error", "Refund request is invalid")
		return
	}
	refund, replay, err := router.service.RequestRefund(request.Context(), domain.RequestRefundCommand{ClientID: tenantFrom(request.Context()), ChargeID: body.ChargeID, AmountMinor: body.AmountMinor, IdempotencyKey: request.Header.Get("Idempotency-Key"), Reason: body.Reason, OperatorIdentityID: operatorID})
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	status := http.StatusCreated
	if replay {
		status = http.StatusOK
	}
	writeJSON(response, status, toRefundResponse(refund))
}

func (router *Router) completeRefund(response http.ResponseWriter, request *http.Request) {
	operatorID, err := uuid.Parse(request.Header.Get("X-JBoot-Operator-Id"))
	if err != nil {
		writeProblem(response, request, http.StatusBadRequest, "invalid_operator", "Valid operator header is required")
		return
	}
	refundID, err := uuid.Parse(request.PathValue("refundId"))
	if err != nil {
		writeProblem(response, request, http.StatusBadRequest, "invalid_refund_id", "Refund id is invalid")
		return
	}
	request.Body = http.MaxBytesReader(response, request.Body, 8<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var body completeRefundBody
	if err := decoder.Decode(&body); err != nil {
		writeProblem(response, request, http.StatusUnprocessableEntity, "validation_error", "Refund completion is invalid")
		return
	}
	refund, err := router.service.CompleteRefund(request.Context(), domain.CompleteRefundCommand{ClientID: tenantFrom(request.Context()), RefundID: refundID, Succeeded: body.Succeeded, ResolutionNote: body.ResolutionNote, OperatorIdentityID: operatorID})
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	writeJSON(response, http.StatusOK, toRefundResponse(refund))
}

func (router *Router) listRefunds(response http.ResponseWriter, request *http.Request) {
	refunds, err := router.service.ListRefunds(request.Context(), tenantFrom(request.Context()), 50)
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	items := make([]refundResponse, 0, len(refunds))
	for _, refund := range refunds {
		items = append(items, toRefundResponse(refund))
	}
	writeJSON(response, http.StatusOK, map[string]any{"data": items})
}

type reconciliationResponse struct {
	ChargeID              uuid.UUID           `json:"chargeId"`
	MerchantReference     string              `json:"merchantReference"`
	AmountMinor           int64               `json:"amountMinor"`
	Status                domain.ChargeStatus `json:"status"`
	VerificationAttempts  int                 `json:"verificationAttempts"`
	NextVerificationAt    *time.Time          `json:"nextVerificationAt,omitempty"`
	LastVerificationAt    *time.Time          `json:"lastVerificationAt,omitempty"`
	LastVerificationError *string             `json:"lastVerificationError,omitempty"`
	CreatedAt             time.Time           `json:"createdAt"`
}

func (router *Router) listReconciliation(response http.ResponseWriter, request *http.Request) {
	items, err := router.service.ListReconciliation(request.Context(), tenantFrom(request.Context()), 50)
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	result := make([]reconciliationResponse, 0, len(items))
	for _, item := range items {
		result = append(result, reconciliationResponse{
			ChargeID: item.ChargeID, MerchantReference: item.MerchantReference,
			AmountMinor: item.AmountMinor, Status: item.Status,
			VerificationAttempts: item.VerificationAttempts,
			NextVerificationAt:   item.NextVerificationAt, LastVerificationAt: item.LastVerificationAt,
			LastVerificationError: item.LastVerificationError, CreatedAt: item.CreatedAt,
		})
	}
	writeJSON(response, http.StatusOK, map[string]any{"data": result})
}

func toRefundResponse(refund domain.Refund) refundResponse {
	return refundResponse{
		ID: refund.ID, ChargeID: refund.ChargeID, AmountMinor: refund.AmountMinor,
		Status: refund.Status, Reason: refund.Reason,
		OperatorIdentityID: refund.OperatorIdentityID, ResolutionNote: refund.ResolutionNote,
		CreatedAt: refund.CreatedAt, UpdatedAt: refund.UpdatedAt, CompletedAt: refund.CompletedAt,
	}
}

type rateBucket struct {
	started time.Time
	count   int
}
type ipRateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	buckets map[string]rateBucket
}

func newIPRateLimiter(limit int, window time.Duration) *ipRateLimiter {
	return &ipRateLimiter{limit: limit, window: window, buckets: map[string]rateBucket{}}
}
func (limiter *ipRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
			ip = host
		}
		now := time.Now()
		limiter.mu.Lock()
		bucket := limiter.buckets[ip]
		if bucket.started.IsZero() || now.Sub(bucket.started) >= limiter.window {
			bucket = rateBucket{started: now}
		}
		bucket.count++
		limiter.buckets[ip] = bucket
		allowed := bucket.count <= limiter.limit
		limiter.mu.Unlock()
		if !allowed {
			w.Header().Set("Retry-After", "60")
			writeProblem(w, r, http.StatusTooManyRequests, "rate_limited", "Too many public requests")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func toConnectionResponse(connection domain.ProviderConnection) providerConnectionResponse {
	return providerConnectionResponse{
		Provider: connection.Provider, PublicIdentifier: connection.PublicIdentifier,
		Status: connection.Status, VerifiedAt: connection.VerifiedAt, UpdatedAt: connection.UpdatedAt,
	}
}

func decodeCreateRequest(response http.ResponseWriter, request *http.Request) (createChargeRequest, error) {
	request.Body = http.MaxBytesReader(response, request.Body, 16<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var body createChargeRequest
	if err := decoder.Decode(&body); err != nil {
		return createChargeRequest{}, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return createChargeRequest{}, errors.New("request must contain one JSON object")
	}
	return body, nil
}

func (router *Router) getCharge(response http.ResponseWriter, request *http.Request) {
	chargeID, err := uuid.Parse(request.PathValue("chargeId"))
	if err != nil {
		writeProblem(response, request, http.StatusBadRequest, "invalid_charge_id", "Charge id is invalid")
		return
	}
	charge, err := router.service.GetCharge(request.Context(), tenantFrom(request.Context()), chargeID)
	if err != nil {
		router.writeDomainError(response, request, err)
		return
	}
	writeJSON(response, http.StatusOK, toChargeResponse(charge))
}

func (router *Router) writeDomainError(response http.ResponseWriter, request *http.Request, err error) {
	switch {
	case errors.Is(err, domain.ErrInvalidCommand):
		writeProblem(response, request, http.StatusUnprocessableEntity, "validation_error", "Charge command is invalid")
	case errors.Is(err, domain.ErrCapabilityDisabled):
		writeProblem(response, request, http.StatusUnprocessableEntity, "capability_disabled", "Payments capability is disabled")
	case errors.Is(err, domain.ErrIdempotencyConflict):
		writeProblem(response, request, http.StatusConflict, "idempotency_conflict", "Idempotency key has a different payload")
	case errors.Is(err, domain.ErrNotFound):
		writeProblem(response, request, http.StatusNotFound, "not_found", "Charge was not found")
	case errors.Is(err, domain.ErrConnectionRequired):
		writeProblem(response, request, http.StatusUnprocessableEntity, "provider_connection_required", "A verified provider connection is required")
	case errors.Is(err, domain.ErrProviderUnavailable):
		writeProblem(response, request, http.StatusServiceUnavailable, "provider_unavailable", "Payment provider is temporarily unavailable")
	case errors.Is(err, domain.ErrRefundAmountExceeded):
		writeProblem(response, request, http.StatusUnprocessableEntity, "refund_amount_exceeded", "Refund amount exceeds the remaining received amount")
	default:
		router.logger.ErrorContext(request.Context(), "request_failed", "error", err.Error())
		writeProblem(response, request, http.StatusInternalServerError, "internal_error", "Internal error")
	}
}

func toChargeResponse(charge domain.Charge) chargeResponse {
	return chargeResponse{
		ID: charge.ID, ConsumerApplication: charge.ConsumerApplication,
		MerchantOrderReference: charge.MerchantOrderReference,
		AmountMinor:            charge.AmountMinor, Currency: charge.Currency,
		Status: charge.Status, CreatedAt: charge.CreatedAt,
		CheckoutURL: charge.CheckoutURL,
	}
}

func writeProblem(
	response http.ResponseWriter,
	request *http.Request,
	status int,
	code, title string,
) {
	requestID, _ := request.Context().Value(contextKey("request_id")).(string)
	writeJSON(response, status, map[string]any{
		"type":  fmt.Sprintf("https://docs.jboot.local/problems/%s", code),
		"title": title, "status": status, "code": code, "requestId": requestID,
	})
}

func writeJSON(response http.ResponseWriter, status int, payload any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(payload)
}
