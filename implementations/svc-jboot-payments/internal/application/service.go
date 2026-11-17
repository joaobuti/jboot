package application

import (
	"context"
	"crypto/sha256"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jboot-platform/svc-jboot-payments/internal/domain"
	"go.opentelemetry.io/otel"
)

var (
	chargeCreatedCounter, _ = otel.Meter("svc-jboot-payments/application").Int64Counter(
		"payments.charge.created",
	)
	chargeReplayCounter, _ = otel.Meter("svc-jboot-payments/application").Int64Counter(
		"payments.charge.idempotent_replay",
	)
	capabilityBlockedCounter, _ = otel.Meter("svc-jboot-payments/application").Int64Counter(
		"payments.charge.capability_blocked",
	)
	callbackSignalCounter, _ = otel.Meter("svc-jboot-payments/application").Int64Counter(
		"payments.pix.callback_signal",
	)
	reconciliationConfirmedCounter, _ = otel.Meter("svc-jboot-payments/application").Int64Counter(
		"payments.pix.reconciliation_confirmed",
	)
	reconciliationDeferredCounter, _ = otel.Meter("svc-jboot-payments/application").Int64Counter(
		"payments.pix.reconciliation_deferred",
	)
	verificationAttemptCounter, _ = otel.Meter("svc-jboot-payments/application").Int64Counter(
		"payments.pix.verification_attempt",
	)
	refundRequestedCounter, _ = otel.Meter("svc-jboot-payments/application").Int64Counter(
		"payments.pix.refund_requested",
	)
	refundCompletedCounter, _ = otel.Meter("svc-jboot-payments/application").Int64Counter(
		"payments.pix.refund_completed",
	)
)

type ChargeRepository interface {
	Create(ctx context.Context, command domain.CreateChargeCommand, requestHash []byte) (domain.Charge, bool, error)
	Get(ctx context.Context, clientID, chargeID uuid.UUID) (domain.Charge, error)
	UpsertConnection(ctx context.Context, command domain.ConfigureConnectionCommand) (domain.ProviderConnection, error)
	GetConnection(ctx context.Context, clientID uuid.UUID) (domain.ProviderConnection, error)
	BindCheckout(ctx context.Context, clientID, chargeID, connectionID uuid.UUID, checkout domain.CheckoutResult) (domain.Charge, error)
	MarkCreationOutcomeUnknown(ctx context.Context, clientID, chargeID uuid.UUID) error
	RecordCallback(ctx context.Context, signal domain.CallbackSignal) (domain.Charge, domain.ProviderConnection, error)
	ConfirmReceived(ctx context.Context, clientID, chargeID uuid.UUID, check domain.ProviderPaymentCheck) (domain.Charge, error)
	ClaimReconciliation(ctx context.Context, workerID string, limit int) ([]domain.ReconciliationCandidate, error)
	ScheduleReconciliation(ctx context.Context, clientID, chargeID uuid.UUID, workerID, failure string) error
	RequestRefund(ctx context.Context, command domain.RequestRefundCommand) (domain.Refund, bool, error)
	CompleteRefund(ctx context.Context, command domain.CompleteRefundCommand) (domain.Refund, error)
	ListRefunds(ctx context.Context, clientID uuid.UUID, limit int) ([]domain.Refund, error)
	ListReconciliation(ctx context.Context, clientID uuid.UUID, limit int) ([]domain.ReconciliationItem, error)
}

type CapabilityAuthorizer interface {
	Enabled(ctx context.Context, clientID uuid.UUID, capability string) (bool, error)
}

type ProviderGateway interface {
	CreateCheckout(context.Context, domain.CreateCheckoutInput) (domain.CheckoutResult, error)
	CheckPayment(context.Context, domain.CheckPaymentInput) (domain.ProviderPaymentCheck, error)
}

type Service struct {
	repository ChargeRepository
	capability CapabilityAuthorizer
	provider   ProviderGateway
}

func NewService(repository ChargeRepository, capability CapabilityAuthorizer, providers ...ProviderGateway) *Service {
	service := &Service{repository: repository, capability: capability}
	if len(providers) > 0 {
		service.provider = providers[0]
	}
	return service
}

func (service *Service) CreateCharge(
	ctx context.Context,
	command domain.CreateChargeCommand,
) (domain.Charge, bool, error) {
	if err := command.Validate(); err != nil {
		return domain.Charge{}, false, err
	}
	enabled, err := service.capability.Enabled(ctx, command.ClientID, "payments")
	if err != nil {
		return domain.Charge{}, false, err
	}
	if !enabled {
		capabilityBlockedCounter.Add(ctx, 1)
		return domain.Charge{}, false, domain.ErrCapabilityDisabled
	}
	requestHash, err := hashCommand(command)
	if err != nil {
		return domain.Charge{}, false, err
	}
	charge, replay, err := service.repository.Create(ctx, command, requestHash)
	if err == nil {
		if replay {
			chargeReplayCounter.Add(ctx, 1)
		} else {
			chargeCreatedCounter.Add(ctx, 1)
		}
	}
	if err != nil || replay || command.PaymentMethod != "pix" {
		return charge, replay, err
	}
	if service.provider == nil {
		return domain.Charge{}, false, domain.ErrProviderUnavailable
	}
	connection, err := service.repository.GetConnection(ctx, command.ClientID)
	if err != nil || connection.Status != "verified" {
		return domain.Charge{}, false, domain.ErrConnectionRequired
	}
	checkout, err := service.provider.CreateCheckout(ctx, domain.CreateCheckoutInput{
		ChargeID: charge.ID.String(), Handle: connection.PublicIdentifier,
		OrderReference: charge.ID.String(), AmountMinor: charge.AmountMinor,
	})
	if err != nil {
		_ = service.repository.MarkCreationOutcomeUnknown(ctx, command.ClientID, charge.ID)
		return domain.Charge{}, false, err
	}
	charge, err = service.repository.BindCheckout(ctx, command.ClientID, charge.ID, connection.ID, checkout)
	return charge, false, err
}

func (service *Service) GetCharge(
	ctx context.Context,
	clientID, chargeID uuid.UUID,
) (domain.Charge, error) {
	return service.repository.Get(ctx, clientID, chargeID)
}

func (service *Service) ConfigureInfinitePay(
	ctx context.Context,
	command domain.ConfigureConnectionCommand,
) (domain.ProviderConnection, error) {
	if err := command.Validate(); err != nil {
		return domain.ProviderConnection{}, err
	}
	return service.repository.UpsertConnection(ctx, command)
}

func (service *Service) GetInfinitePayConnection(ctx context.Context, clientID uuid.UUID) (domain.ProviderConnection, error) {
	return service.repository.GetConnection(ctx, clientID)
}

func (service *Service) RecordInfinitePayCallback(
	ctx context.Context,
	signal domain.CallbackSignal,
) (domain.Charge, error) {
	if err := signal.Validate(); err != nil {
		return domain.Charge{}, err
	}
	charge, connection, err := service.repository.RecordCallback(ctx, signal)
	if err != nil {
		return domain.Charge{}, err
	}
	_ = connection
	callbackSignalCounter.Add(ctx, 1)
	return charge, nil
}

func (service *Service) VerifyCharge(ctx context.Context, clientID, chargeID uuid.UUID) (domain.Charge, error) {
	charge, err := service.repository.Get(ctx, clientID, chargeID)
	if err != nil {
		return domain.Charge{}, err
	}
	connection, err := service.repository.GetConnection(ctx, clientID)
	if err != nil {
		return domain.Charge{}, err
	}
	return service.verify(ctx, charge, connection)
}

func (service *Service) verify(ctx context.Context, charge domain.Charge, connection domain.ProviderConnection) (domain.Charge, error) {
	if charge.Status == domain.StatusReceived {
		return charge, nil
	}
	if service.provider == nil || charge.ExternalOrderReference == nil ||
		charge.ExternalTransactionNSU == nil || charge.ExternalSlug == nil {
		return charge, nil
	}
	check, err := service.provider.CheckPayment(ctx, domain.CheckPaymentInput{
		Handle: connection.PublicIdentifier, OrderReference: *charge.ExternalOrderReference,
		TransactionNSU: *charge.ExternalTransactionNSU, Slug: *charge.ExternalSlug,
	})
	verificationAttemptCounter.Add(ctx, 1)
	if err != nil {
		return domain.Charge{}, err
	}
	if !check.Success || !check.Paid || check.CaptureMethod != "pix" || check.Installments != 1 ||
		check.AmountMinor != charge.AmountMinor || check.PaidAmount != charge.AmountMinor {
		return charge, nil
	}
	return service.repository.ConfirmReceived(ctx, charge.ClientID, charge.ID, check)
}

func (service *Service) ReconcileDue(ctx context.Context, workerID string, limit int) (int, error) {
	candidates, err := service.repository.ClaimReconciliation(ctx, workerID, limit)
	if err != nil {
		return 0, err
	}
	for _, candidate := range candidates {
		verified, verifyErr := service.verify(ctx, candidate.Charge, candidate.Connection)
		failure := ""
		if verifyErr != nil {
			failure = "provider_verification_failed"
		}
		if verifyErr == nil && verified.Status == domain.StatusReceived {
			reconciliationConfirmedCounter.Add(ctx, 1)
			continue
		}
		if err := service.repository.ScheduleReconciliation(ctx, candidate.Charge.ClientID, candidate.Charge.ID, workerID, failure); err != nil {
			return 0, err
		}
		reconciliationDeferredCounter.Add(ctx, 1)
	}
	return len(candidates), nil
}

func (service *Service) RequestRefund(ctx context.Context, command domain.RequestRefundCommand) (domain.Refund, bool, error) {
	if err := command.Validate(); err != nil {
		return domain.Refund{}, false, err
	}
	refund, replay, err := service.repository.RequestRefund(ctx, command)
	if err == nil && !replay {
		refundRequestedCounter.Add(ctx, 1)
	}
	return refund, replay, err
}

func (service *Service) CompleteRefund(ctx context.Context, command domain.CompleteRefundCommand) (domain.Refund, error) {
	if err := command.Validate(); err != nil {
		return domain.Refund{}, err
	}
	refund, err := service.repository.CompleteRefund(ctx, command)
	if err == nil {
		refundCompletedCounter.Add(ctx, 1)
	}
	return refund, err
}

func (service *Service) ListRefunds(ctx context.Context, clientID uuid.UUID, limit int) ([]domain.Refund, error) {
	if clientID == uuid.Nil {
		return nil, domain.ErrInvalidCommand
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	return service.repository.ListRefunds(ctx, clientID, limit)
}

func (service *Service) ListReconciliation(ctx context.Context, clientID uuid.UUID, limit int) ([]domain.ReconciliationItem, error) {
	if clientID == uuid.Nil {
		return nil, domain.ErrInvalidCommand
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	return service.repository.ListReconciliation(ctx, clientID, limit)
}

func hashCommand(command domain.CreateChargeCommand) ([]byte, error) {
	payload, err := json.Marshal(struct {
		ConsumerApplication    string `json:"consumerApplication"`
		MerchantOrderReference string `json:"merchantOrderReference"`
		AmountMinor            int64  `json:"amountMinor"`
		Currency               string `json:"currency"`
		PaymentMethod          string `json:"paymentMethod"`
	}{
		command.ConsumerApplication,
		command.MerchantOrderReference,
		command.AmountMinor,
		command.Currency,
		command.PaymentMethod,
	})
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(payload)
	return digest[:], nil
}
