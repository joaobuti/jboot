package domain

import (
	"errors"
	"testing"

	"github.com/google/uuid"
)

func TestReceivedRequiresIntegralCorrelatedVerification(t *testing.T) {
	providerAccountID := uuid.New()
	charge := Charge{
		AmountMinor: 100, Status: StatusVerificationPending,
		ProviderConnectionID: &providerAccountID,
	}
	verified, err := charge.ConfirmReceived(ProviderVerification{
		Paid: true, Method: "pix", ExpectedAmount: 100, PaidAmount: 100,
		ProviderAccountID: providerAccountID,
	})
	if err != nil || verified.Status != StatusReceived {
		t.Fatalf("expected received, got status=%s err=%v", verified.Status, err)
	}

	_, err = charge.ConfirmReceived(ProviderVerification{
		Paid: true, Method: "pix", ExpectedAmount: 100, PaidAmount: 99,
		ProviderAccountID: uuid.New(),
	})
	if !errors.Is(err, ErrVerificationFailed) {
		t.Fatalf("expected verification failure, got %v", err)
	}

	_, err = charge.ConfirmReceived(ProviderVerification{
		Paid: true, Method: "pix", ExpectedAmount: 100, PaidAmount: 100,
		ProviderAccountID: uuid.New(),
	})
	if !errors.Is(err, ErrVerificationFailed) {
		t.Fatalf("wrong provider account must fail correlation, got %v", err)
	}
}

func TestReceivedIsTerminal(t *testing.T) {
	if CanTransition(StatusReceived, StatusAwaitingPayment) {
		t.Fatal("received must not regress")
	}
}

func TestCreateCommandRejectsFloatLikeOrInvalidValues(t *testing.T) {
	command := CreateChargeCommand{
		ClientID: uuid.New(), ConsumerApplication: "pdv",
		MerchantOrderReference: "sale-1", AmountMinor: 0,
		Currency: "BRL", IdempotencyKey: "12345678",
	}
	if !errors.Is(command.Validate(), ErrInvalidCommand) {
		t.Fatal("zero amount must be rejected")
	}
}

func TestRefundCommandsRequireAuditableOperatorAndReason(t *testing.T) {
	valid := RequestRefundCommand{
		ClientID: uuid.New(), ChargeID: uuid.New(), AmountMinor: 100,
		IdempotencyKey: "refund-12345678", Reason: "solicitacao do cliente",
		OperatorIdentityID: uuid.New(),
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid refund request rejected: %v", err)
	}
	valid.OperatorIdentityID = uuid.Nil
	if !errors.Is(valid.Validate(), ErrInvalidCommand) {
		t.Fatal("refund request without operator must be rejected")
	}

	completion := CompleteRefundCommand{
		ClientID: uuid.New(), RefundID: uuid.New(), Succeeded: true,
		ResolutionNote:     "estorno confirmado no aplicativo InfinitePay",
		OperatorIdentityID: uuid.New(),
	}
	if err := completion.Validate(); err != nil {
		t.Fatalf("valid refund completion rejected: %v", err)
	}
}
