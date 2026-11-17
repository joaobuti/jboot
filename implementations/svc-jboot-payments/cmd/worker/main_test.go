package main

import (
	"context"
	"log/slog"
	"testing"

	"github.com/google/uuid"
	"github.com/jboot-platform/svc-jboot-payments/internal/adapters/postgres"
)

type fakeOutbox struct {
	events    []postgres.OutboxEvent
	published []uuid.UUID
}

func (store *fakeOutbox) ClaimOutbox(context.Context, string, int) ([]postgres.OutboxEvent, error) {
	return store.events, nil
}

func (store *fakeOutbox) MarkOutboxPublished(_ context.Context, id uuid.UUID, _ string) error {
	store.published = append(store.published, id)
	return nil
}

func (*fakeOutbox) ReleaseOutbox(context.Context, uuid.UUID, string) error { return nil }

func TestDispatchOnceMarksPublishedOnlyAfterPublish(t *testing.T) {
	eventID := uuid.New()
	store := &fakeOutbox{events: []postgres.OutboxEvent{{ID: eventID, EventType: "payment.charge.created"}}}
	if err := dispatchOnce(context.Background(), store, "worker", slog.Default()); err != nil {
		t.Fatal(err)
	}
	if len(store.published) != 1 || store.published[0] != eventID {
		t.Fatalf("expected event %s published once", eventID)
	}
}
