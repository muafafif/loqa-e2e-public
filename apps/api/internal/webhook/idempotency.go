package webhook

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// ProcessedEvent records a webhook event that has already been handled, so
// retries from the payment provider (Xendit resends on timeout/non-2xx) don't
// create duplicate subscriptions/license keys or double-extend a subscription.
type ProcessedEvent struct {
	ID        string `gorm:"primaryKey;column:id"`
	Source    string `gorm:"primaryKey;column:source"` // "invoice" | "recurring"
	CreatedAt time.Time
}

func (ProcessedEvent) TableName() string { return "processed_webhook_events" }

type IdempotencyStore interface {
	// MarkProcessed atomically records (source, eventID) as processed.
	// alreadyProcessed is true if this event was already recorded by a prior
	// call — the caller should skip re-processing but still return 200 OK
	// to the webhook sender.
	MarkProcessed(ctx context.Context, source, eventID string) (alreadyProcessed bool, err error)
}

type gormIdempotencyStore struct {
	db *gorm.DB
}

func NewIdempotencyStore(db *gorm.DB) IdempotencyStore {
	return &gormIdempotencyStore{db: db}
}

func (s *gormIdempotencyStore) MarkProcessed(ctx context.Context, source, eventID string) (bool, error) {
	result := s.db.WithContext(ctx).Exec(
		`INSERT INTO processed_webhook_events (id, source, created_at) VALUES (?, ?, ?) ON CONFLICT (id, source) DO NOTHING`,
		eventID, source, time.Now(),
	)
	if result.Error != nil {
		return false, fmt.Errorf("mark webhook event processed: %w", result.Error)
	}
	// RowsAffected == 0 means the (source, id) pair already existed → duplicate delivery.
	return result.RowsAffected == 0, nil
}
