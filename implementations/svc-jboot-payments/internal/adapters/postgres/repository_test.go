package postgres

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jboot-platform/svc-jboot-payments/internal/domain"
)

func TestRepositoryIdempotencyAndTenantIsolation(t *testing.T) {
	databaseURL := os.Getenv("PAYMENTS_TEST_DATABASE_URL")
	identityURL := os.Getenv("PAYMENTS_TEST_IDENTITY_DATABASE_URL")
	if databaseURL == "" || identityURL == "" {
		t.Skip("integration database URLs are not configured")
	}
	ctx := context.Background()
	store, err := Open(ctx, databaseURL, identityURL)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := store.domain.Exec(ctx, "TRUNCATE outbox_events, refunds, provider_events, payment_attempts, charges, provider_connections CASCADE"); err != nil {
		t.Fatal(err)
	}

	command := domain.CreateChargeCommand{
		ClientID: uuid.New(), ConsumerApplication: "pdv",
		MerchantOrderReference: "sale-integration", AmountMinor: 100,
		Currency: "BRL", IdempotencyKey: "integration-idem-1",
	}
	requestHash := []byte("same-request")
	created, replay, err := store.Create(ctx, command, requestHash)
	if err != nil || replay {
		t.Fatalf("create failed replay=%v err=%v", replay, err)
	}
	replayed, replay, err := store.Create(ctx, command, requestHash)
	if err != nil || !replay || replayed.ID != created.ID {
		t.Fatalf("idempotent replay failed replay=%v err=%v", replay, err)
	}

	_, _, err = store.Create(ctx, command, []byte("different-request"))
	if !errors.Is(err, domain.ErrIdempotencyConflict) {
		t.Fatalf("expected idempotency conflict, got %v", err)
	}
	_, err = store.Get(ctx, uuid.New(), created.ID)
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("cross-tenant read must be not found, got %v", err)
	}
	otherTenantCommand := command
	otherTenantCommand.ClientID = uuid.New()
	otherTenant, replay, err := store.Create(ctx, otherTenantCommand, requestHash)
	if err != nil || replay || otherTenant.ID == created.ID {
		t.Fatalf("same key in another tenant must create an independent charge: replay=%v err=%v", replay, err)
	}

	var chargeCount, outboxCount int
	if err := store.domain.QueryRow(ctx, `
		SELECT COUNT(*) FROM charges
		 WHERE client_id = $1 AND consumer_application = $2 AND idempotency_key = $3`,
		command.ClientID, command.ConsumerApplication, command.IdempotencyKey,
	).Scan(&chargeCount); err != nil {
		t.Fatal(err)
	}
	if err := store.domain.QueryRow(ctx, `
		SELECT COUNT(*) FROM outbox_events
		 WHERE client_id = $1 AND aggregate_id = $2 AND event_type = 'payment.charge.created'`,
		command.ClientID, created.ID,
	).Scan(&outboxCount); err != nil {
		t.Fatal(err)
	}
	if chargeCount != 1 || outboxCount != 1 {
		t.Fatalf("idempotent replay must persist one charge and one event, got charges=%d events=%d", chargeCount, outboxCount)
	}
}

func TestRepositoryConcurrentIdempotencyCreatesOneCharge(t *testing.T) {
	databaseURL := os.Getenv("PAYMENTS_TEST_DATABASE_URL")
	identityURL := os.Getenv("PAYMENTS_TEST_IDENTITY_DATABASE_URL")
	if databaseURL == "" || identityURL == "" {
		t.Skip("integration database URLs are not configured")
	}
	ctx := context.Background()
	store, err := Open(ctx, databaseURL, identityURL)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	command := domain.CreateChargeCommand{
		ClientID: uuid.New(), ConsumerApplication: "pdv",
		MerchantOrderReference: "sale-concurrent", AmountMinor: 100,
		Currency: "BRL", IdempotencyKey: "integration-concurrent-1",
	}

	const workers = 8
	ids := make(chan uuid.UUID, workers)
	errorsChannel := make(chan error, workers)
	var wait sync.WaitGroup
	for range workers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			charge, _, createErr := store.Create(ctx, command, []byte("same-concurrent-request"))
			if createErr != nil {
				errorsChannel <- createErr
				return
			}
			ids <- charge.ID
		}()
	}
	wait.Wait()
	close(ids)
	close(errorsChannel)
	for createErr := range errorsChannel {
		t.Fatalf("concurrent create failed: %v", createErr)
	}
	var expected uuid.UUID
	for id := range ids {
		if expected == uuid.Nil {
			expected = id
		}
		if id != expected {
			t.Fatalf("expected one charge id, got %s and %s", expected, id)
		}
	}
	var chargeCount, outboxCount int
	if err := store.domain.QueryRow(ctx, `
		SELECT COUNT(*) FROM charges
		 WHERE client_id = $1 AND consumer_application = $2 AND idempotency_key = $3`,
		command.ClientID, command.ConsumerApplication, command.IdempotencyKey,
	).Scan(&chargeCount); err != nil {
		t.Fatal(err)
	}
	if err := store.domain.QueryRow(ctx, `
		SELECT COUNT(*) FROM outbox_events
		 WHERE client_id = $1 AND aggregate_id = $2 AND event_type = 'payment.charge.created'`,
		command.ClientID, expected,
	).Scan(&outboxCount); err != nil {
		t.Fatal(err)
	}
	if chargeCount != 1 || outboxCount != 1 {
		t.Fatalf("concurrent replay must persist one charge and one event, got charges=%d events=%d", chargeCount, outboxCount)
	}
}

func TestRepositoryRefundIsIdempotentAndNeverExceedsReceivedAmount(t *testing.T) {
	databaseURL := os.Getenv("PAYMENTS_TEST_DATABASE_URL")
	identityURL := os.Getenv("PAYMENTS_TEST_IDENTITY_DATABASE_URL")
	if databaseURL == "" || identityURL == "" {
		t.Skip("integration database URLs are not configured")
	}
	ctx := context.Background()
	store, err := Open(ctx, databaseURL, identityURL)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	clientID := uuid.New()
	charge, _, err := store.Create(ctx, domain.CreateChargeCommand{
		ClientID: clientID, ConsumerApplication: "pdv", MerchantOrderReference: "sale-refund",
		AmountMinor: 100, Currency: "BRL", IdempotencyKey: "charge-refund-test",
	}, []byte("refund-charge"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.domain.Exec(ctx, "UPDATE charges SET status='received', received_at=NOW() WHERE id=$1", charge.ID); err != nil {
		t.Fatal(err)
	}
	command := domain.RequestRefundCommand{
		ClientID: clientID, ChargeID: charge.ID, AmountMinor: 60,
		IdempotencyKey: "refund-idem-test", Reason: "cliente solicitou", OperatorIdentityID: uuid.New(),
	}
	created, replay, err := store.RequestRefund(ctx, command)
	if err != nil || replay {
		t.Fatalf("refund create failed replay=%v err=%v", replay, err)
	}
	replayed, replay, err := store.RequestRefund(ctx, command)
	if err != nil || !replay || replayed.ID != created.ID {
		t.Fatalf("refund replay failed replay=%v err=%v", replay, err)
	}
	command.IdempotencyKey = "refund-second-test"
	command.AmountMinor = 41
	if _, _, err := store.RequestRefund(ctx, command); !errors.Is(err, domain.ErrRefundAmountExceeded) {
		t.Fatalf("expected amount ceiling, got %v", err)
	}
	command.IdempotencyKey = "refund-idem-test"
	command.AmountMinor = 59
	if _, _, err := store.RequestRefund(ctx, command); !errors.Is(err, domain.ErrIdempotencyConflict) {
		t.Fatalf("expected idempotency payload conflict, got %v", err)
	}
}
