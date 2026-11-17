package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jboot-platform/svc-jboot-payments/internal/application"
	"github.com/jboot-platform/svc-jboot-payments/internal/domain"
)

type routerRepository struct {
	charge         domain.Charge
	callbackSignal domain.CallbackSignal
}

func (repository *routerRepository) Create(
	_ context.Context,
	command domain.CreateChargeCommand,
	_ []byte,
) (domain.Charge, bool, error) {
	repository.charge = domain.Charge{
		ID: uuid.New(), ClientID: command.ClientID,
		ConsumerApplication:    command.ConsumerApplication,
		MerchantOrderReference: command.MerchantOrderReference,
		AmountMinor:            command.AmountMinor, Currency: command.Currency,
		Status: domain.StatusCreated, CreatedAt: time.Now().UTC(),
	}
	return repository.charge, false, nil
}

func (repository *routerRepository) Get(_ context.Context, clientID, chargeID uuid.UUID) (domain.Charge, error) {
	if repository.charge.ID != chargeID || repository.charge.ClientID != clientID {
		return domain.Charge{}, domain.ErrNotFound
	}
	return repository.charge, nil
}

func (repository *routerRepository) UpsertConnection(context.Context, domain.ConfigureConnectionCommand) (domain.ProviderConnection, error) {
	return domain.ProviderConnection{}, nil
}
func (repository *routerRepository) GetConnection(_ context.Context, clientID uuid.UUID) (domain.ProviderConnection, error) {
	return domain.ProviderConnection{ID: uuid.New(), ClientID: clientID, PublicIdentifier: "merchant", Status: "verified"}, nil
}
func (repository *routerRepository) BindCheckout(_ context.Context, _ uuid.UUID, _ uuid.UUID, connectionID uuid.UUID, checkout domain.CheckoutResult) (domain.Charge, error) {
	repository.charge.ProviderConnectionID = &connectionID
	repository.charge.CheckoutURL = &checkout.URL
	repository.charge.Status = domain.StatusAwaitingPayment
	return repository.charge, nil
}
func (repository *routerRepository) MarkCreationOutcomeUnknown(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}
func (repository *routerRepository) RecordCallback(_ context.Context, signal domain.CallbackSignal) (domain.Charge, domain.ProviderConnection, error) {
	repository.callbackSignal = signal
	return repository.charge, domain.ProviderConnection{}, nil
}
func (repository *routerRepository) ConfirmReceived(context.Context, uuid.UUID, uuid.UUID, domain.ProviderPaymentCheck) (domain.Charge, error) {
	return repository.charge, nil
}
func (repository *routerRepository) ClaimReconciliation(context.Context, string, int) ([]domain.ReconciliationCandidate, error) {
	return nil, nil
}
func (repository *routerRepository) ScheduleReconciliation(context.Context, uuid.UUID, uuid.UUID, string, string) error {
	return nil
}
func (repository *routerRepository) RequestRefund(context.Context, domain.RequestRefundCommand) (domain.Refund, bool, error) {
	return domain.Refund{}, false, nil
}
func (repository *routerRepository) CompleteRefund(context.Context, domain.CompleteRefundCommand) (domain.Refund, error) {
	return domain.Refund{}, nil
}
func (repository *routerRepository) ListRefunds(context.Context, uuid.UUID, int) ([]domain.Refund, error) {
	return nil, nil
}
func (repository *routerRepository) ListReconciliation(context.Context, uuid.UUID, int) ([]domain.ReconciliationItem, error) {
	return nil, nil
}

type enabledCapability struct{}

func (enabledCapability) Enabled(context.Context, uuid.UUID, string) (bool, error) {
	return true, nil
}

type fakeProvider struct{}

func (fakeProvider) CreateCheckout(context.Context, domain.CreateCheckoutInput) (domain.CheckoutResult, error) {
	return domain.CheckoutResult{URL: "https://checkout.infinitepay.io/merchant?lenc=test", ExternalOrderReference: "order"}, nil
}

func (fakeProvider) CheckPayment(context.Context, domain.CheckPaymentInput) (domain.ProviderPaymentCheck, error) {
	return domain.ProviderPaymentCheck{}, nil
}

type healthyStore struct{}

func (healthyStore) Ping(context.Context) error { return nil }

func TestCreateChargeRejectsUnknownFieldsAndReturnsExplicitDTO(t *testing.T) {
	repository := &routerRepository{}
	service := application.NewService(repository, enabledCapability{}, fakeProvider{})
	auth := NewAuthenticator("secret", "jboot-identity", "svc:payments", map[string]struct{}{"platform-api": {}})
	router := NewRouter(service, healthyStore{}, auth, slog.Default())
	tenantID := uuid.New()

	invalid := authenticatedRequest(t, tenantID, `{
        "consumerApplication":"pdv","merchantOrderReference":"sale-1",
        "amountMinor":100,"currency":"BRL","provider":"infinitepay"}`)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, invalid)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unknown provider field must be rejected, got %d", response.Code)
	}

	valid := authenticatedRequest(t, tenantID, `{
        "consumerApplication":"pdv","merchantOrderReference":"sale-1",
        "amountMinor":100,"currency":"BRL","paymentMethod":"pix"}`)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, valid)
	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", response.Code, response.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "awaiting_payment" || body["clientId"] != nil {
		t.Fatalf("unexpected response DTO: %#v", body)
	}
}

func TestInfinitePayWebhookAcceptsDocumentedPayloadWithItems(t *testing.T) {
	chargeID := uuid.New()
	repository := &routerRepository{charge: domain.Charge{ID: chargeID, Status: domain.StatusVerificationPending}}
	service := application.NewService(repository, enabledCapability{}, fakeProvider{})
	auth := NewAuthenticator("secret", "jboot-identity", "svc:payments", map[string]struct{}{"platform-api": {}})
	router := NewRouter(service, healthyStore{}, auth, slog.Default())
	body := `{
		"invoice_slug":"invoice-1","amount":100,"paid_amount":100,"installments":1,
		"capture_method":"pix","transaction_nsu":"tx-1","order_nsu":"order-1",
		"receipt_url":"https://example.test/receipt","items":[{"name":"Venda PDV","quantity":1,"price":100}]
	}`
	request := httptest.NewRequest(http.MethodPost, "/v1/public/infinitepay/webhook/"+chargeID.String(), strings.NewReader(body))
	request.RemoteAddr = "203.0.113.10:4444"
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected webhook 200, got %d body=%s", response.Code, response.Body.String())
	}
	if repository.callbackSignal.TransactionNSU != "tx-1" || repository.callbackSignal.PaidAmount != 100 {
		t.Fatalf("documented webhook was not mapped: %#v", repository.callbackSignal)
	}
}

func TestPublicRateLimiterRejectsRequestsAboveLimit(t *testing.T) {
	limiter := newIPRateLimiter(1, time.Minute)
	handler := limiter.Middleware(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusNoContent)
	}))
	for attempt, expected := range []int{http.StatusNoContent, http.StatusTooManyRequests} {
		request := httptest.NewRequest(http.MethodGet, "/callback", nil)
		request.RemoteAddr = "203.0.113.11:5555"
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != expected {
			t.Fatalf("attempt %d: expected %d, got %d", attempt+1, expected, response.Code)
		}
	}
}

func authenticatedRequest(t *testing.T, tenantID uuid.UUID, body string) *http.Request {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/v1/charges", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+signedToken(t, "svc:payments", "platform-api", "service_access"))
	request.Header.Set("X-JBoot-Client-Id", tenantID.String())
	request.Header.Set("Idempotency-Key", "idem-12345678")
	request.Header.Set("Content-Type", "application/json")
	return request
}
