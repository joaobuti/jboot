package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jboot-platform/svc-jboot-payments/internal/domain"
)

type fakeRepository struct {
	charge         domain.Charge
	hash           []byte
	callbackSignal domain.CallbackSignal
	candidates     []domain.ReconciliationCandidate
	scheduled      int
	confirmed      int
}

func (repo *fakeRepository) Create(
	_ context.Context,
	command domain.CreateChargeCommand,
	hash []byte,
) (domain.Charge, bool, error) {
	if repo.charge.ID != uuid.Nil {
		if string(repo.hash) != string(hash) {
			return domain.Charge{}, false, domain.ErrIdempotencyConflict
		}
		return repo.charge, true, nil
	}
	repo.hash = append([]byte(nil), hash...)
	repo.charge = domain.Charge{
		ID: uuid.New(), ClientID: command.ClientID,
		ConsumerApplication:    command.ConsumerApplication,
		MerchantOrderReference: command.MerchantOrderReference,
		AmountMinor:            command.AmountMinor, Currency: command.Currency,
		Status: domain.StatusCreated, IdempotencyKey: command.IdempotencyKey,
		CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	return repo.charge, false, nil
}

func (repo *fakeRepository) Get(_ context.Context, clientID, chargeID uuid.UUID) (domain.Charge, error) {
	if repo.charge.ClientID != clientID || repo.charge.ID != chargeID {
		return domain.Charge{}, domain.ErrNotFound
	}
	return repo.charge, nil
}

func (repo *fakeRepository) UpsertConnection(context.Context, domain.ConfigureConnectionCommand) (domain.ProviderConnection, error) {
	return domain.ProviderConnection{}, nil
}
func (repo *fakeRepository) GetConnection(_ context.Context, clientID uuid.UUID) (domain.ProviderConnection, error) {
	return domain.ProviderConnection{ID: uuid.New(), ClientID: clientID, PublicIdentifier: "merchant", Status: "verified"}, nil
}

func (repo *fakeRepository) BindCheckout(_ context.Context, _ uuid.UUID, _ uuid.UUID, connectionID uuid.UUID, checkout domain.CheckoutResult) (domain.Charge, error) {
	repo.charge.ProviderConnectionID = &connectionID
	repo.charge.CheckoutURL = &checkout.URL
	repo.charge.Status = domain.StatusAwaitingPayment
	return repo.charge, nil
}
func (repo *fakeRepository) MarkCreationOutcomeUnknown(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}
func (repo *fakeRepository) RecordCallback(_ context.Context, signal domain.CallbackSignal) (domain.Charge, domain.ProviderConnection, error) {
	repo.callbackSignal = signal
	return repo.charge, domain.ProviderConnection{PublicIdentifier: "merchant"}, nil
}
func (repo *fakeRepository) ConfirmReceived(context.Context, uuid.UUID, uuid.UUID, domain.ProviderPaymentCheck) (domain.Charge, error) {
	repo.confirmed++
	repo.charge.Status = domain.StatusReceived
	return repo.charge, nil
}
func (repo *fakeRepository) ClaimReconciliation(context.Context, string, int) ([]domain.ReconciliationCandidate, error) {
	return repo.candidates, nil
}
func (repo *fakeRepository) ScheduleReconciliation(context.Context, uuid.UUID, uuid.UUID, string, string) error {
	repo.scheduled++
	return nil
}
func (repo *fakeRepository) RequestRefund(context.Context, domain.RequestRefundCommand) (domain.Refund, bool, error) {
	return domain.Refund{}, false, nil
}
func (repo *fakeRepository) CompleteRefund(context.Context, domain.CompleteRefundCommand) (domain.Refund, error) {
	return domain.Refund{}, nil
}
func (repo *fakeRepository) ListRefunds(context.Context, uuid.UUID, int) ([]domain.Refund, error) {
	return nil, nil
}
func (repo *fakeRepository) ListReconciliation(context.Context, uuid.UUID, int) ([]domain.ReconciliationItem, error) {
	return nil, nil
}

type fakeCapability bool

func (enabled fakeCapability) Enabled(context.Context, uuid.UUID, string) (bool, error) {
	return bool(enabled), nil
}

type fakeGateway struct {
	checkCalls int
	check      domain.ProviderPaymentCheck
}

func (*fakeGateway) CreateCheckout(_ context.Context, input domain.CreateCheckoutInput) (domain.CheckoutResult, error) {
	return domain.CheckoutResult{URL: "https://checkout.infinitepay.io/merchant?lenc=test", ExternalOrderReference: input.OrderReference}, nil
}

func (gateway *fakeGateway) CheckPayment(context.Context, domain.CheckPaymentInput) (domain.ProviderPaymentCheck, error) {
	gateway.checkCalls++
	return gateway.check, nil
}

func TestCreateChargeIsIdempotentForSamePayload(t *testing.T) {
	repo := &fakeRepository{}
	service := NewService(repo, fakeCapability(true), &fakeGateway{})
	command := validCommand()
	created, replay, err := service.CreateCharge(context.Background(), command)
	if err != nil || replay {
		t.Fatalf("unexpected create result replay=%v err=%v", replay, err)
	}
	replayed, replay, err := service.CreateCharge(context.Background(), command)
	if err != nil || !replay || replayed.ID != created.ID {
		t.Fatalf("expected idempotent replay, got replay=%v err=%v", replay, err)
	}
}

func TestCreateChargeRejectsDifferentPayloadForSameKey(t *testing.T) {
	repo := &fakeRepository{}
	service := NewService(repo, fakeCapability(true), &fakeGateway{})
	command := validCommand()
	_, _, _ = service.CreateCharge(context.Background(), command)
	command.AmountMinor++
	_, _, err := service.CreateCharge(context.Background(), command)
	if !errors.Is(err, domain.ErrIdempotencyConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
}

func TestCreateChargeRequiresTenantCapability(t *testing.T) {
	service := NewService(&fakeRepository{}, fakeCapability(false), &fakeGateway{})
	_, _, err := service.CreateCharge(context.Background(), validCommand())
	if !errors.Is(err, domain.ErrCapabilityDisabled) {
		t.Fatalf("expected capability disabled, got %v", err)
	}
}

func TestCallbackIsOnlyASignalAndNeverConfirmsPayment(t *testing.T) {
	chargeID := uuid.New()
	repo := &fakeRepository{charge: domain.Charge{ID: chargeID, Status: domain.StatusVerificationPending}}
	gateway := &fakeGateway{check: domain.ProviderPaymentCheck{Success: true, Paid: true}}
	service := NewService(repo, fakeCapability(true), gateway)
	signal := domain.CallbackSignal{
		ChargeID: chargeID, OrderNSU: "order-1", TransactionNSU: "tx-1",
		Slug: "invoice-1", CaptureMethod: "pix",
	}

	charge, err := service.RecordInfinitePayCallback(context.Background(), signal)
	if err != nil || charge.ID != chargeID {
		t.Fatalf("unexpected callback result charge=%#v err=%v", charge, err)
	}
	if gateway.checkCalls != 0 || repo.confirmed != 0 {
		t.Fatalf("callback must not verify or confirm: checks=%d confirmations=%d", gateway.checkCalls, repo.confirmed)
	}
}

func TestReconciliationUsesProviderCheckAsSoleSourceOfTruth(t *testing.T) {
	chargeID, clientID, connectionID := uuid.New(), uuid.New(), uuid.New()
	order, transaction, slug := "order-1", "tx-1", "invoice-1"
	charge := domain.Charge{
		ID: chargeID, ClientID: clientID, AmountMinor: 100, Status: domain.StatusVerificationPending,
		ExternalOrderReference: &order, ExternalTransactionNSU: &transaction, ExternalSlug: &slug,
	}
	repo := &fakeRepository{charge: charge, candidates: []domain.ReconciliationCandidate{{
		Charge: charge, Connection: domain.ProviderConnection{ID: connectionID, ClientID: clientID, PublicIdentifier: "merchant"},
	}}}
	gateway := &fakeGateway{check: domain.ProviderPaymentCheck{
		Success: true, Paid: true, AmountMinor: 100, PaidAmount: 100, Installments: 1, CaptureMethod: "pix",
	}}
	service := NewService(repo, fakeCapability(true), gateway)

	processed, err := service.ReconcileDue(context.Background(), "worker-1", 10)
	if err != nil || processed != 1 {
		t.Fatalf("unexpected reconciliation result processed=%d err=%v", processed, err)
	}
	if gateway.checkCalls != 1 || repo.confirmed != 1 || repo.scheduled != 0 {
		t.Fatalf("unexpected reconciliation effects checks=%d confirmations=%d scheduled=%d", gateway.checkCalls, repo.confirmed, repo.scheduled)
	}
}

func validCommand() domain.CreateChargeCommand {
	return domain.CreateChargeCommand{
		ClientID: uuid.New(), ConsumerApplication: "pdv",
		MerchantOrderReference: "sale-1", AmountMinor: 100,
		Currency: "BRL", IdempotencyKey: "idem-12345678", PaymentMethod: "pix",
	}
}
