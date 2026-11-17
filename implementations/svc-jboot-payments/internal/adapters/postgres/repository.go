package postgres

import (
	"bytes"
	"context"
	"crypto/sha256"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jboot-platform/svc-jboot-payments/internal/domain"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct {
	domain   *pgxpool.Pool
	identity *pgxpool.Pool
}

type OutboxEvent struct {
	ID        uuid.UUID
	EventType string
	Payload   []byte
}

func Open(ctx context.Context, databaseURL, identityDatabaseURL string) (*Store, error) {
	domainPool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open payments database: %w", err)
	}
	identityPool, err := pgxpool.New(ctx, identityDatabaseURL)
	if err != nil {
		domainPool.Close()
		return nil, fmt.Errorf("open identity database: %w", err)
	}
	return &Store{domain: domainPool, identity: identityPool}, nil
}

func (store *Store) Close() {
	store.identity.Close()
	store.domain.Close()
}

func (store *Store) Migrate(ctx context.Context) error {
	connection, err := store.domain.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer connection.Release()
	if _, err = connection.Exec(ctx, "SELECT pg_advisory_lock(hashtext('svc-jboot-payments-migrations'))"); err != nil {
		return fmt.Errorf("lock migrations: %w", err)
	}
	defer func() {
		_, _ = connection.Exec(context.Background(), "SELECT pg_advisory_unlock(hashtext('svc-jboot-payments-migrations'))")
	}()
	if _, err = connection.Exec(ctx, `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	for _, entry := range entries {
		if err := applyMigration(ctx, connection, entry.Name()); err != nil {
			return err
		}
	}
	return nil
}

type migrationConnection interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Begin(context.Context) (pgx.Tx, error)
}

func applyMigration(ctx context.Context, connection migrationConnection, name string) error {
	var applied bool
	err := connection.QueryRow(ctx,
		"SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", name,
	).Scan(&applied)
	if err != nil || applied {
		return err
	}
	sql, err := migrations.ReadFile("migrations/" + name)
	if err != nil {
		return fmt.Errorf("read migration %s: %w", name, err)
	}
	tx, err := connection.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", name, err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, string(sql)); err != nil {
		return fmt.Errorf("apply migration %s: %w", name, err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations(version) VALUES ($1)", name); err != nil {
		return fmt.Errorf("record migration %s: %w", name, err)
	}
	return tx.Commit(ctx)
}

func (store *Store) Ping(ctx context.Context) error {
	if err := store.domain.Ping(ctx); err != nil {
		return fmt.Errorf("payments database: %w", err)
	}
	if err := store.identity.Ping(ctx); err != nil {
		return fmt.Errorf("identity database: %w", err)
	}
	return nil
}

func (store *Store) Enabled(ctx context.Context, clientID uuid.UUID, capability string) (bool, error) {
	var enabled bool
	err := store.identity.QueryRow(ctx, `
        SELECT EXISTS (
            SELECT 1
              FROM client_capabilities cc
              JOIN capability_registry cr ON cr.slug = cc.capability
             WHERE cc.client_id = $1
               AND cc.capability = $2
               AND cc.enabled = true
               AND cr.active = true
        )`, clientID, capability).Scan(&enabled)
	return enabled, err
}

func (store *Store) Create(
	ctx context.Context,
	command domain.CreateChargeCommand,
	requestHash []byte,
) (domain.Charge, bool, error) {
	tx, err := store.domain.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return domain.Charge{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	charge, err := insertCharge(ctx, tx, command, requestHash)
	if err == nil {
		if err = insertCreatedEvent(ctx, tx, charge); err != nil {
			return domain.Charge{}, false, err
		}
		return charge, false, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return domain.Charge{}, false, err
	}
	existing, err := getByIdempotency(ctx, tx, command)
	if err != nil {
		return domain.Charge{}, false, err
	}
	if !bytes.Equal(existing.RequestHash, requestHash) {
		return domain.Charge{}, false, domain.ErrIdempotencyConflict
	}
	return existing, true, tx.Commit(ctx)
}

func insertCharge(
	ctx context.Context,
	tx pgx.Tx,
	command domain.CreateChargeCommand,
	requestHash []byte,
) (domain.Charge, error) {
	row := tx.QueryRow(ctx, `
        INSERT INTO charges (
            client_id, consumer_application, merchant_order_reference,
            amount_minor, currency, status, idempotency_key, request_hash
        ) VALUES ($1, $2, $3, $4, $5, 'created', $6, $7)
        ON CONFLICT (client_id, consumer_application, idempotency_key) DO NOTHING
        RETURNING id, client_id, consumer_application, merchant_order_reference,
                  amount_minor, currency, status, idempotency_key, request_hash,
                  provider_connection_id, checkout_url, external_order_reference,
                  external_transaction_nsu, external_slug,
                  commercial_terms_version, created_at, updated_at`,
		command.ClientID, command.ConsumerApplication, command.MerchantOrderReference,
		command.AmountMinor, command.Currency, command.IdempotencyKey, requestHash,
	)
	return scanCharge(row)
}

func getByIdempotency(
	ctx context.Context,
	tx pgx.Tx,
	command domain.CreateChargeCommand,
) (domain.Charge, error) {
	row := tx.QueryRow(ctx, `
        SELECT id, client_id, consumer_application, merchant_order_reference,
               amount_minor, currency, status, idempotency_key, request_hash,
               provider_connection_id, checkout_url, external_order_reference,
               external_transaction_nsu, external_slug,
               commercial_terms_version, created_at, updated_at
          FROM charges
         WHERE client_id = $1 AND consumer_application = $2 AND idempotency_key = $3`,
		command.ClientID, command.ConsumerApplication, command.IdempotencyKey,
	)
	return scanCharge(row)
}

func insertCreatedEvent(ctx context.Context, tx pgx.Tx, charge domain.Charge) error {
	payload, err := json.Marshal(map[string]any{
		"paymentId":        charge.ID,
		"clientId":         charge.ClientID,
		"applicationId":    charge.ConsumerApplication,
		"grossAmountMinor": charge.AmountMinor,
		"currency":         charge.Currency,
	})
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
        INSERT INTO outbox_events (
            client_id, aggregate_type, aggregate_id, event_type, sequence, payload
        ) VALUES ($1, 'payment', $2, 'payment.charge.created', 1, $3)`,
		charge.ClientID, charge.ID, payload,
	)
	return err
}

func (store *Store) Get(ctx context.Context, clientID, chargeID uuid.UUID) (domain.Charge, error) {
	row := store.domain.QueryRow(ctx, `
        SELECT id, client_id, consumer_application, merchant_order_reference,
               amount_minor, currency, status, idempotency_key, request_hash,
               provider_connection_id, checkout_url, external_order_reference,
               external_transaction_nsu, external_slug,
               commercial_terms_version, created_at, updated_at
          FROM charges WHERE client_id = $1 AND id = $2`, clientID, chargeID)
	charge, err := scanCharge(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Charge{}, domain.ErrNotFound
	}
	return charge, err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanCharge(row rowScanner) (domain.Charge, error) {
	var charge domain.Charge
	err := row.Scan(
		&charge.ID, &charge.ClientID, &charge.ConsumerApplication,
		&charge.MerchantOrderReference, &charge.AmountMinor, &charge.Currency,
		&charge.Status, &charge.IdempotencyKey, &charge.RequestHash,
		&charge.ProviderConnectionID, &charge.CheckoutURL, &charge.ExternalOrderReference,
		&charge.ExternalTransactionNSU, &charge.ExternalSlug,
		&charge.CommercialTermsVersion,
		&charge.CreatedAt, &charge.UpdatedAt,
	)
	return charge, err
}

func (store *Store) UpsertConnection(
	ctx context.Context,
	command domain.ConfigureConnectionCommand,
) (domain.ProviderConnection, error) {
	tx, err := store.domain.Begin(ctx)
	if err != nil {
		return domain.ProviderConnection{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	identifier := strings.TrimPrefix(strings.TrimSpace(command.PublicIdentifier), "$")
	_, err = tx.Exec(ctx, `
        UPDATE provider_connections SET status = 'disabled', updated_at = NOW()
         WHERE client_id = $1 AND provider = 'infinitepay'
           AND public_identifier <> $2 AND status <> 'disabled'`, command.ClientID, identifier)
	if err != nil {
		return domain.ProviderConnection{}, err
	}
	row := tx.QueryRow(ctx, `
        INSERT INTO provider_connections (
            client_id, provider, public_identifier, secret_ref, status, verified_at
        ) VALUES ($1, 'infinitepay', $2, $3, 'verified', NOW())
        ON CONFLICT (client_id, provider, public_identifier) DO UPDATE
          SET secret_ref = EXCLUDED.secret_ref, status = 'verified',
              verified_at = NOW(), updated_at = NOW()
        RETURNING id, client_id, provider, public_identifier, secret_ref,
                  status, verified_at, created_at, updated_at`,
		command.ClientID, identifier, command.SecretRef)
	connection, err := scanConnection(row)
	if err != nil {
		return domain.ProviderConnection{}, err
	}
	_, err = tx.Exec(ctx, `
        INSERT INTO provider_connection_audit (
            client_id, provider_connection_id, action, evidence
        ) VALUES ($1, $2, 'verified', $3)`,
		command.ClientID, connection.ID, command.ValidationEvidence)
	if err != nil {
		return domain.ProviderConnection{}, err
	}
	return connection, tx.Commit(ctx)
}

func (store *Store) GetConnection(ctx context.Context, clientID uuid.UUID) (domain.ProviderConnection, error) {
	row := store.domain.QueryRow(ctx, `
        SELECT id, client_id, provider, public_identifier, secret_ref,
               status, verified_at, created_at, updated_at
          FROM provider_connections
         WHERE client_id = $1 AND provider = 'infinitepay' AND status <> 'disabled'
         ORDER BY updated_at DESC LIMIT 1`, clientID)
	connection, err := scanConnection(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ProviderConnection{}, domain.ErrConnectionRequired
	}
	return connection, err
}

func scanConnection(row rowScanner) (domain.ProviderConnection, error) {
	var connection domain.ProviderConnection
	err := row.Scan(&connection.ID, &connection.ClientID, &connection.Provider,
		&connection.PublicIdentifier, &connection.SecretRef, &connection.Status,
		&connection.VerifiedAt, &connection.CreatedAt, &connection.UpdatedAt)
	return connection, err
}

func (store *Store) BindCheckout(
	ctx context.Context,
	clientID, chargeID, connectionID uuid.UUID,
	checkout domain.CheckoutResult,
) (domain.Charge, error) {
	row := store.domain.QueryRow(ctx, `
        UPDATE charges
           SET provider_connection_id = $3, checkout_url = $4,
               external_order_reference = $5, status = 'awaiting_payment', updated_at = NOW()
         WHERE client_id = $1 AND id = $2 AND status = 'created'
        RETURNING id, client_id, consumer_application, merchant_order_reference,
                  amount_minor, currency, status, idempotency_key, request_hash,
                  provider_connection_id, checkout_url, external_order_reference,
                  external_transaction_nsu, external_slug,
                  commercial_terms_version, created_at, updated_at`,
		clientID, chargeID, connectionID, checkout.URL, checkout.ExternalOrderReference)
	return scanCharge(row)
}

func (store *Store) MarkCreationOutcomeUnknown(ctx context.Context, clientID, chargeID uuid.UUID) error {
	_, err := store.domain.Exec(ctx, `
        UPDATE charges SET status = 'creation_outcome_unknown', updated_at = NOW()
         WHERE client_id = $1 AND id = $2 AND status = 'created'`, clientID, chargeID)
	return err
}

func (store *Store) RecordCallback(
	ctx context.Context,
	signal domain.CallbackSignal,
) (domain.Charge, domain.ProviderConnection, error) {
	tx, err := store.domain.Begin(ctx)
	if err != nil {
		return domain.Charge{}, domain.ProviderConnection{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	payload, _ := json.Marshal(map[string]any{
		"orderNsu": signal.OrderNSU, "transactionNsu": signal.TransactionNSU,
		"slug": signal.Slug, "captureMethod": signal.CaptureMethod,
		"amountMinor": signal.AmountMinor, "paidAmount": signal.PaidAmount,
		"installments": signal.Installments,
	})
	payloadHash := sha256.Sum256(payload)
	externalEventID := signal.OrderNSU + ":" + signal.TransactionNSU + ":" + signal.Slug
	var clientID, connectionID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT client_id, provider_connection_id FROM charges
		 WHERE id = $1 AND external_order_reference = $2`,
		signal.ChargeID, signal.OrderNSU).Scan(&clientID, &connectionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Charge{}, domain.ProviderConnection{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Charge{}, domain.ProviderConnection{}, err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO provider_events (
			client_id, provider_connection_id, external_event_id, payload_hash,
			payload_redacted, status, processed_at
		) VALUES ($1, $2, $3, $4, $5, 'processed', NOW())
		ON CONFLICT (provider_connection_id, external_event_id) DO NOTHING`,
		clientID, connectionID, externalEventID, payloadHash[:], payload)
	if err != nil {
		return domain.Charge{}, domain.ProviderConnection{}, err
	}
	row := tx.QueryRow(ctx, `
        UPDATE charges
           SET external_transaction_nsu = $2, external_slug = $3,
               status = CASE WHEN status = 'received' THEN status ELSE 'verification_pending' END,
               next_verification_at = CASE WHEN status = 'received' THEN next_verification_at ELSE NOW() END,
               updated_at = NOW()
         WHERE id = $1 AND external_order_reference = $4
        RETURNING id, client_id, consumer_application, merchant_order_reference,
                  amount_minor, currency, status, idempotency_key, request_hash,
                  provider_connection_id, checkout_url, external_order_reference,
                  external_transaction_nsu, external_slug,
                  commercial_terms_version, created_at, updated_at`,
		signal.ChargeID, signal.TransactionNSU, signal.Slug, signal.OrderNSU)
	charge, err := scanCharge(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Charge{}, domain.ProviderConnection{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Charge{}, domain.ProviderConnection{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Charge{}, domain.ProviderConnection{}, err
	}
	connection, err := store.GetConnection(ctx, charge.ClientID)
	return charge, connection, err
}

func (store *Store) ConfirmReceived(
	ctx context.Context,
	clientID, chargeID uuid.UUID,
	check domain.ProviderPaymentCheck,
) (domain.Charge, error) {
	tx, err := store.domain.Begin(ctx)
	if err != nil {
		return domain.Charge{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	row := tx.QueryRow(ctx, `
		UPDATE charges SET status = 'received', received_at = COALESCE(received_at, NOW()),
		       next_verification_at = NULL, verification_locked_at = NULL,
		       verification_locked_by = NULL, last_verification_error = NULL,
		       last_verification_at = NOW(), updated_at = NOW()
         WHERE client_id = $1 AND id = $2
           AND status IN ('verification_pending', 'pending_reconciliation')
           AND amount_minor = $3
        RETURNING id, client_id, consumer_application, merchant_order_reference,
                  amount_minor, currency, status, idempotency_key, request_hash,
                  provider_connection_id, checkout_url, external_order_reference,
                  external_transaction_nsu, external_slug,
                  commercial_terms_version, created_at, updated_at`,
		clientID, chargeID, check.PaidAmount)
	charge, err := scanCharge(row)
	if errors.Is(err, pgx.ErrNoRows) {
		charge, err = getChargeTx(ctx, tx, clientID, chargeID)
		if err == nil && charge.Status == domain.StatusReceived {
			return charge, tx.Commit(ctx)
		}
	}
	if err != nil {
		return domain.Charge{}, err
	}
	payload, _ := json.Marshal(map[string]any{
		"paymentId": charge.ID, "clientId": charge.ClientID,
		"grossAmountMinor": charge.AmountMinor, "currency": charge.Currency,
	})
	_, err = tx.Exec(ctx, `
        INSERT INTO outbox_events (
            client_id, aggregate_type, aggregate_id, event_type, sequence, payload
        ) VALUES ($1, 'payment', $2, 'payment.received', 2, $3)
        ON CONFLICT (aggregate_type, aggregate_id, event_type, sequence) DO NOTHING`,
		clientID, chargeID, payload)
	if err != nil {
		return domain.Charge{}, err
	}
	return charge, tx.Commit(ctx)
}

func (store *Store) ClaimReconciliation(
	ctx context.Context,
	workerID string,
	limit int,
) ([]domain.ReconciliationCandidate, error) {
	rows, err := store.domain.Query(ctx, `
		WITH candidates AS (
			SELECT id FROM charges
			 WHERE status IN ('verification_pending', 'pending_reconciliation')
			   AND external_transaction_nsu IS NOT NULL AND external_slug IS NOT NULL
			   AND (next_verification_at IS NULL OR next_verification_at <= NOW())
			   AND (verification_locked_at IS NULL OR verification_locked_at < NOW() - INTERVAL '2 minutes')
			 ORDER BY COALESCE(next_verification_at, updated_at)
			 FOR UPDATE SKIP LOCKED LIMIT $1
		)
		UPDATE charges c SET verification_locked_at = NOW(), verification_locked_by = $2
		FROM candidates x, provider_connections pc
		WHERE c.id = x.id
		  AND pc.id = c.provider_connection_id
		  AND pc.client_id = c.client_id
		RETURNING c.id, c.client_id, c.consumer_application, c.merchant_order_reference,
		 c.amount_minor, c.currency, c.status, c.idempotency_key, c.request_hash,
		 c.provider_connection_id, c.checkout_url, c.external_order_reference,
		 c.external_transaction_nsu, c.external_slug, c.commercial_terms_version,
		 c.created_at, c.updated_at,
		 pc.id, pc.client_id, pc.provider, pc.public_identifier, pc.secret_ref,
		 pc.status, pc.verified_at, pc.created_at, pc.updated_at`, limit, workerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]domain.ReconciliationCandidate, 0, limit)
	for rows.Next() {
		var candidate domain.ReconciliationCandidate
		err := rows.Scan(
			&candidate.Charge.ID, &candidate.Charge.ClientID, &candidate.Charge.ConsumerApplication,
			&candidate.Charge.MerchantOrderReference, &candidate.Charge.AmountMinor, &candidate.Charge.Currency,
			&candidate.Charge.Status, &candidate.Charge.IdempotencyKey, &candidate.Charge.RequestHash,
			&candidate.Charge.ProviderConnectionID, &candidate.Charge.CheckoutURL,
			&candidate.Charge.ExternalOrderReference, &candidate.Charge.ExternalTransactionNSU,
			&candidate.Charge.ExternalSlug, &candidate.Charge.CommercialTermsVersion,
			&candidate.Charge.CreatedAt, &candidate.Charge.UpdatedAt,
			&candidate.Connection.ID, &candidate.Connection.ClientID, &candidate.Connection.Provider,
			&candidate.Connection.PublicIdentifier, &candidate.Connection.SecretRef,
			&candidate.Connection.Status, &candidate.Connection.VerifiedAt,
			&candidate.Connection.CreatedAt, &candidate.Connection.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		result = append(result, candidate)
	}
	return result, rows.Err()
}

func (store *Store) ScheduleReconciliation(
	ctx context.Context, clientID, chargeID uuid.UUID, workerID, failure string,
) error {
	_, err := store.domain.Exec(ctx, `
		UPDATE charges
		   SET status = CASE WHEN status = 'received' THEN status ELSE 'pending_reconciliation' END,
		       verification_attempts = verification_attempts + 1,
		       last_verification_at = NOW(), last_verification_error = NULLIF($4, ''),
		       next_verification_at = NOW() + LEAST(INTERVAL '30 minutes',
		           INTERVAL '15 seconds' * power(2, LEAST(verification_attempts, 7))),
		       verification_locked_at = NULL, verification_locked_by = NULL, updated_at = NOW()
		 WHERE client_id = $1 AND id = $2 AND verification_locked_by = $3`,
		clientID, chargeID, workerID, failure)
	return err
}

func (store *Store) RequestRefund(ctx context.Context, command domain.RequestRefundCommand) (domain.Refund, bool, error) {
	tx, err := store.domain.Begin(ctx)
	if err != nil {
		return domain.Refund{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var received int64
	err = tx.QueryRow(ctx, `SELECT amount_minor FROM charges WHERE client_id=$1 AND id=$2 AND status='received' FOR UPDATE`,
		command.ClientID, command.ChargeID).Scan(&received)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Refund{}, false, domain.ErrNotFound
	}
	if err != nil {
		return domain.Refund{}, false, err
	}
	existing, existingErr := scanRefund(tx.QueryRow(ctx, `
		SELECT id,client_id,charge_id,amount_minor,status,idempotency_key,reason,
		       operator_identity_id,resolution_note,created_at,updated_at,completed_at
		  FROM refunds
		 WHERE client_id=$1 AND charge_id=$2 AND idempotency_key=$3`,
		command.ClientID, command.ChargeID, command.IdempotencyKey))
	if existingErr == nil {
		if existing.AmountMinor != command.AmountMinor || existing.Reason != command.Reason ||
			existing.OperatorIdentityID != command.OperatorIdentityID {
			return domain.Refund{}, false, domain.ErrIdempotencyConflict
		}
		return existing, true, tx.Commit(ctx)
	}
	if !errors.Is(existingErr, pgx.ErrNoRows) {
		return domain.Refund{}, false, existingErr
	}
	var refunded int64
	if err = tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount_minor),0) FROM refunds WHERE client_id=$1 AND charge_id=$2 AND status IN ('requested','pending','succeeded')`, command.ClientID, command.ChargeID).Scan(&refunded); err != nil {
		return domain.Refund{}, false, err
	}
	if refunded+command.AmountMinor > received {
		return domain.Refund{}, false, domain.ErrRefundAmountExceeded
	}
	row := tx.QueryRow(ctx, `
		INSERT INTO refunds (client_id, charge_id, amount_minor, status, idempotency_key, reason, operator_identity_id)
		VALUES ($1,$2,$3,'requested',$4,$5,$6)
		ON CONFLICT (client_id, charge_id, idempotency_key) DO NOTHING
		RETURNING id,client_id,charge_id,amount_minor,status,idempotency_key,reason,operator_identity_id,resolution_note,created_at,updated_at,completed_at`,
		command.ClientID, command.ChargeID, command.AmountMinor, command.IdempotencyKey, command.Reason, command.OperatorIdentityID)
	refund, err := scanRefund(row)
	if err != nil {
		return domain.Refund{}, false, err
	}
	payload, _ := json.Marshal(map[string]any{"refundId": refund.ID, "chargeId": refund.ChargeID, "amountMinor": refund.AmountMinor})
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(client_id,aggregate_type,aggregate_id,event_type,sequence,payload) VALUES($1,'refund',$2,'payment.refund.requested',1,$3) ON CONFLICT DO NOTHING`, command.ClientID, refund.ID, payload)
	if err != nil {
		return domain.Refund{}, false, err
	}
	return refund, false, tx.Commit(ctx)
}

func (store *Store) CompleteRefund(ctx context.Context, command domain.CompleteRefundCommand) (domain.Refund, error) {
	status := "failed"
	eventType := "payment.refund.failed"
	if command.Succeeded {
		status = "succeeded"
		eventType = "payment.refund.succeeded"
	}
	tx, err := store.domain.Begin(ctx)
	if err != nil {
		return domain.Refund{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	row := tx.QueryRow(ctx, `UPDATE refunds SET status=$3,resolution_note=$4,operator_identity_id=$5,completed_at=NOW(),updated_at=NOW() WHERE client_id=$1 AND id=$2 AND status IN ('requested','pending') RETURNING id,client_id,charge_id,amount_minor,status,idempotency_key,reason,operator_identity_id,resolution_note,created_at,updated_at,completed_at`, command.ClientID, command.RefundID, status, command.ResolutionNote, command.OperatorIdentityID)
	refund, err := scanRefund(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Refund{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Refund{}, err
	}
	payload, _ := json.Marshal(map[string]any{"refundId": refund.ID, "chargeId": refund.ChargeID, "amountMinor": refund.AmountMinor})
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(client_id,aggregate_type,aggregate_id,event_type,sequence,payload) VALUES($1,'refund',$2,$3,2,$4) ON CONFLICT DO NOTHING`, command.ClientID, refund.ID, eventType, payload)
	if err != nil {
		return domain.Refund{}, err
	}
	return refund, tx.Commit(ctx)
}

func scanRefund(row rowScanner) (domain.Refund, error) {
	var refund domain.Refund
	err := row.Scan(&refund.ID, &refund.ClientID, &refund.ChargeID, &refund.AmountMinor, &refund.Status, &refund.IdempotencyKey, &refund.Reason, &refund.OperatorIdentityID, &refund.ResolutionNote, &refund.CreatedAt, &refund.UpdatedAt, &refund.CompletedAt)
	return refund, err
}

func (store *Store) ListRefunds(ctx context.Context, clientID uuid.UUID, limit int) ([]domain.Refund, error) {
	rows, err := store.domain.Query(ctx, `SELECT id,client_id,charge_id,amount_minor,status,idempotency_key,reason,operator_identity_id,resolution_note,created_at,updated_at,completed_at FROM refunds WHERE client_id=$1 ORDER BY created_at DESC LIMIT $2`, clientID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]domain.Refund, 0, limit)
	for rows.Next() {
		refund, err := scanRefund(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, refund)
	}
	return result, rows.Err()
}

func (store *Store) ListReconciliation(ctx context.Context, clientID uuid.UUID, limit int) ([]domain.ReconciliationItem, error) {
	rows, err := store.domain.Query(ctx, `
		SELECT id, merchant_order_reference, amount_minor, status, verification_attempts,
		       next_verification_at, last_verification_at, last_verification_error, created_at
		  FROM charges
		 WHERE client_id=$1 AND status IN ('verification_pending','pending_reconciliation','creation_outcome_unknown')
		 ORDER BY COALESCE(next_verification_at, updated_at), created_at
		 LIMIT $2`, clientID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.ReconciliationItem, 0, limit)
	for rows.Next() {
		var item domain.ReconciliationItem
		if err := rows.Scan(&item.ChargeID, &item.MerchantReference, &item.AmountMinor, &item.Status,
			&item.VerificationAttempts, &item.NextVerificationAt, &item.LastVerificationAt,
			&item.LastVerificationError, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func getChargeTx(ctx context.Context, tx pgx.Tx, clientID, chargeID uuid.UUID) (domain.Charge, error) {
	row := tx.QueryRow(ctx, `
        SELECT id, client_id, consumer_application, merchant_order_reference,
               amount_minor, currency, status, idempotency_key, request_hash,
               provider_connection_id, checkout_url, external_order_reference,
               external_transaction_nsu, external_slug,
               commercial_terms_version, created_at, updated_at
          FROM charges WHERE client_id = $1 AND id = $2`, clientID, chargeID)
	return scanCharge(row)
}

func (store *Store) ClaimOutbox(
	ctx context.Context,
	workerID string,
	limit int,
) ([]OutboxEvent, error) {
	rows, err := store.domain.Query(ctx, `
        WITH candidates AS (
            SELECT id FROM outbox_events
             WHERE published_at IS NULL
               AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
             ORDER BY occurred_at
             FOR UPDATE SKIP LOCKED
             LIMIT $1
        )
        UPDATE outbox_events o
           SET locked_at = NOW(), locked_by = $2
          FROM candidates c
         WHERE o.id = c.id
        RETURNING o.id, o.event_type, o.payload`, limit, workerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]OutboxEvent, 0, limit)
	for rows.Next() {
		var event OutboxEvent
		if err := rows.Scan(&event.ID, &event.EventType, &event.Payload); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func (store *Store) MarkOutboxPublished(ctx context.Context, id uuid.UUID, workerID string) error {
	command, err := store.domain.Exec(ctx, `
        UPDATE outbox_events
           SET published_at = NOW()
         WHERE id = $1 AND locked_by = $2 AND published_at IS NULL`, id, workerID)
	if err != nil {
		return err
	}
	if command.RowsAffected() != 1 {
		return fmt.Errorf("outbox event %s not owned by worker", id)
	}
	return nil
}

func (store *Store) ReleaseOutbox(ctx context.Context, id uuid.UUID, workerID string) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	_, err := store.domain.Exec(ctx, `
        UPDATE outbox_events SET locked_at = NULL, locked_by = NULL
         WHERE id = $1 AND locked_by = $2 AND published_at IS NULL`, id, workerID)
	return err
}
