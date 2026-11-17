package domain

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInvalidCommand       = errors.New("invalid charge command")
	ErrNotFound             = errors.New("charge not found")
	ErrIdempotencyConflict  = errors.New("idempotency key reused with a different payload")
	ErrCapabilityDisabled   = errors.New("payments capability is disabled")
	ErrInvalidTransition    = errors.New("invalid payment state transition")
	ErrVerificationFailed   = errors.New("provider verification does not confirm the expected payment")
	ErrProviderUnavailable  = errors.New("provider is unavailable")
	ErrConnectionRequired   = errors.New("verified provider connection is required")
	ErrRefundAmountExceeded = errors.New("refund amount exceeds received amount")
)

type ChargeStatus string

const (
	StatusCreated                ChargeStatus = "created"
	StatusProviderPending        ChargeStatus = "provider_pending"
	StatusAwaitingPayment        ChargeStatus = "awaiting_payment"
	StatusVerificationPending    ChargeStatus = "verification_pending"
	StatusReceived               ChargeStatus = "received"
	StatusPendingReconciliation  ChargeStatus = "pending_reconciliation"
	StatusCreationOutcomeUnknown ChargeStatus = "creation_outcome_unknown"
	StatusCancelled              ChargeStatus = "cancelled"
	StatusFailed                 ChargeStatus = "failed"
)

type Charge struct {
	ID                     uuid.UUID
	ClientID               uuid.UUID
	ConsumerApplication    string
	MerchantOrderReference string
	AmountMinor            int64
	Currency               string
	Status                 ChargeStatus
	IdempotencyKey         string
	RequestHash            []byte
	ProviderConnectionID   *uuid.UUID
	CheckoutURL            *string
	ExternalOrderReference *string
	ExternalTransactionNSU *string
	ExternalSlug           *string
	CommercialTermsVersion *string
	CreatedAt              time.Time
	UpdatedAt              time.Time
	NextVerificationAt     *time.Time
	VerificationAttempts   int
	LastVerificationAt     *time.Time
	LastVerificationError  *string
	ReceivedAt             *time.Time
}

type CreateChargeCommand struct {
	ClientID               uuid.UUID
	ConsumerApplication    string
	MerchantOrderReference string
	AmountMinor            int64
	Currency               string
	IdempotencyKey         string
	PaymentMethod          string
}

func (command CreateChargeCommand) Validate() error {
	if command.ClientID == uuid.Nil || command.AmountMinor <= 0 || command.Currency != "BRL" {
		return ErrInvalidCommand
	}
	if invalidLength(command.ConsumerApplication, 1, 64) ||
		invalidLength(command.MerchantOrderReference, 1, 128) ||
		invalidLength(command.IdempotencyKey, 8, 128) {
		return ErrInvalidCommand
	}
	if command.PaymentMethod != "pix" {
		return ErrInvalidCommand
	}
	return nil
}

type ProviderConnection struct {
	ID               uuid.UUID
	ClientID         uuid.UUID
	Provider         string
	PublicIdentifier string
	SecretRef        *string
	Status           string
	VerifiedAt       *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type ConfigureConnectionCommand struct {
	ClientID           uuid.UUID
	PublicIdentifier   string
	SecretRef          *string
	ValidationEvidence string
}

func (command ConfigureConnectionCommand) Validate() error {
	identifier := strings.TrimSpace(strings.TrimPrefix(command.PublicIdentifier, "$"))
	if command.ClientID == uuid.Nil || invalidLength(identifier, 2, 64) {
		return ErrInvalidCommand
	}
	if command.SecretRef != nil && invalidLength(*command.SecretRef, 3, 256) {
		return ErrInvalidCommand
	}
	if command.ValidationEvidence != "administrator_declaration_and_real_charge" {
		return ErrInvalidCommand
	}
	return nil
}

type CheckoutResult struct {
	URL                    string
	ExternalOrderReference string
}

type CreateCheckoutInput struct {
	ChargeID       string
	Handle         string
	OrderReference string
	AmountMinor    int64
}

type CheckPaymentInput struct {
	Handle         string
	OrderReference string
	TransactionNSU string
	Slug           string
}

type ProviderPaymentCheck struct {
	Success       bool
	Paid          bool
	AmountMinor   int64
	PaidAmount    int64
	Installments  int
	CaptureMethod string
}

type CallbackSignal struct {
	ChargeID       uuid.UUID
	OrderNSU       string
	TransactionNSU string
	Slug           string
	CaptureMethod  string
	ReceiptURL     string
	AmountMinor    int64
	PaidAmount     int64
	Installments   int
}

type ReconciliationCandidate struct {
	Charge     Charge
	Connection ProviderConnection
}

type ReconciliationItem struct {
	ChargeID              uuid.UUID
	MerchantReference     string
	AmountMinor           int64
	Status                ChargeStatus
	VerificationAttempts  int
	NextVerificationAt    *time.Time
	LastVerificationAt    *time.Time
	LastVerificationError *string
	CreatedAt             time.Time
}

type Refund struct {
	ID                 uuid.UUID
	ClientID           uuid.UUID
	ChargeID           uuid.UUID
	AmountMinor        int64
	Status             string
	IdempotencyKey     string
	Reason             string
	OperatorIdentityID uuid.UUID
	ResolutionNote     *string
	CreatedAt          time.Time
	UpdatedAt          time.Time
	CompletedAt        *time.Time
}

type RequestRefundCommand struct {
	ClientID           uuid.UUID
	ChargeID           uuid.UUID
	AmountMinor        int64
	IdempotencyKey     string
	Reason             string
	OperatorIdentityID uuid.UUID
}

func (command RequestRefundCommand) Validate() error {
	if command.ClientID == uuid.Nil || command.ChargeID == uuid.Nil ||
		command.OperatorIdentityID == uuid.Nil || command.AmountMinor <= 0 ||
		invalidLength(command.IdempotencyKey, 8, 128) || invalidLength(command.Reason, 3, 500) {
		return ErrInvalidCommand
	}
	return nil
}

type CompleteRefundCommand struct {
	ClientID           uuid.UUID
	RefundID           uuid.UUID
	Succeeded          bool
	ResolutionNote     string
	OperatorIdentityID uuid.UUID
}

func (command CompleteRefundCommand) Validate() error {
	if command.ClientID == uuid.Nil || command.RefundID == uuid.Nil ||
		command.OperatorIdentityID == uuid.Nil || invalidLength(command.ResolutionNote, 3, 500) {
		return ErrInvalidCommand
	}
	return nil
}

func (signal CallbackSignal) Validate() error {
	if signal.ChargeID == uuid.Nil || signal.CaptureMethod != "pix" ||
		invalidLength(signal.OrderNSU, 1, 128) ||
		invalidLength(signal.TransactionNSU, 1, 128) ||
		invalidLength(signal.Slug, 1, 128) {
		return ErrInvalidCommand
	}
	return nil
}

type ProviderVerification struct {
	Paid              bool
	Method            string
	ExpectedAmount    int64
	PaidAmount        int64
	ProviderAccountID uuid.UUID
}

func (charge Charge) ConfirmReceived(verification ProviderVerification) (Charge, error) {
	if !CanTransition(charge.Status, StatusReceived) {
		return Charge{}, ErrInvalidTransition
	}
	if !verification.Paid || verification.Method != "pix" ||
		verification.ExpectedAmount != charge.AmountMinor ||
		verification.PaidAmount != charge.AmountMinor ||
		verification.ProviderAccountID == uuid.Nil ||
		charge.ProviderConnectionID == nil ||
		verification.ProviderAccountID != *charge.ProviderConnectionID {
		return Charge{}, ErrVerificationFailed
	}
	charge.Status = StatusReceived
	charge.UpdatedAt = time.Now().UTC()
	return charge, nil
}

func CanTransition(from, to ChargeStatus) bool {
	allowed := map[ChargeStatus]map[ChargeStatus]bool{
		StatusCreated: {
			StatusProviderPending: true, StatusCancelled: true,
		},
		StatusProviderPending: {
			StatusAwaitingPayment: true, StatusCreationOutcomeUnknown: true,
			StatusFailed: true,
		},
		StatusCreationOutcomeUnknown: {
			StatusAwaitingPayment: true, StatusPendingReconciliation: true,
		},
		StatusAwaitingPayment: {
			StatusVerificationPending: true, StatusCancelled: true,
		},
		StatusVerificationPending: {
			StatusReceived: true, StatusPendingReconciliation: true,
		},
		StatusPendingReconciliation: {
			StatusReceived: true, StatusCancelled: true,
		},
	}
	return allowed[from][to]
}

func invalidLength(value string, min, max int) bool {
	length := len(strings.TrimSpace(value))
	return length < min || length > max
}
