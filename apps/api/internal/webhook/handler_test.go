package webhook_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/loqa/api/internal/license"
	"github.com/loqa/api/internal/plan"
	"github.com/loqa/api/internal/subscription"
	"github.com/loqa/api/internal/webhook"
	"github.com/stretchr/testify/assert"
)

const testSecret = "test-secret"

// FakeIdempotencyStore is an in-memory stand-in for the Postgres-backed store,
// so handler tests don't need a real database.
type FakeIdempotencyStore struct {
	mu   sync.Mutex
	seen map[string]bool
}

func NewFakeIdempotencyStore() *FakeIdempotencyStore {
	return &FakeIdempotencyStore{seen: map[string]bool{}}
}

func (s *FakeIdempotencyStore) MarkProcessed(ctx context.Context, source, eventID string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := source + ":" + eventID
	if s.seen[key] {
		return true, nil
	}
	s.seen[key] = true
	return false, nil
}

type StubSubService struct {
	mu          sync.Mutex
	CreateCalls int
	ExtendCalls int
}

func (s *StubSubService) Create(ctx context.Context, userID uint, tier plan.Tier, cycle plan.Cycle, startsAt time.Time) (*subscription.Subscription, error) {
	s.mu.Lock()
	s.CreateCalls++
	s.mu.Unlock()
	return &subscription.Subscription{UserID: userID, Tier: tier, Cycle: cycle}, nil
}

func (s *StubSubService) Extend(ctx context.Context, subscriptionID uint, paidAt time.Time) (*subscription.Subscription, error) {
	s.mu.Lock()
	s.ExtendCalls++
	s.mu.Unlock()
	return &subscription.Subscription{ID: subscriptionID}, nil
}

func (s *StubSubService) GetByID(ctx context.Context, id uint) (*subscription.Subscription, error) {
	return &subscription.Subscription{}, nil
}

func (s *StubSubService) GetByUserID(ctx context.Context, userID uint) ([]*subscription.Subscription, error) {
	return nil, nil
}

func (s *StubSubService) Cancel(ctx context.Context, id uint) error { return nil }
func (s *StubSubService) Revoke(ctx context.Context, id uint) error { return nil }

type StubLicenseService struct{}

func (s *StubLicenseService) Activate(ctx context.Context, key, fingerprint string) (string, error) {
	return "stub-token", nil
}

func (s *StubLicenseService) Validate(ctx context.Context, tokenStr string) (string, error) {
	return "stub-token", nil
}

func (s *StubLicenseService) Generate(ctx context.Context, subscriptionID uint) (*license.LicenseKey, error) {
	return &license.LicenseKey{SubscriptionID: subscriptionID}, nil
}
func (s *StubLicenseService) GetBySubscriptionID(ctx context.Context, subscriptionID uint) (*license.LicenseKey, error) {
	return &license.LicenseKey{}, nil
}
func (s *StubLicenseService) GetByKey(ctx context.Context, key string) (*license.LicenseKey, error) {
	return &license.LicenseKey{}, nil
}
func (s *StubLicenseService) Revoke(ctx context.Context, subscriptionID uint) error { return nil }
func (s *StubLicenseService) RevokeDevice(ctx context.Context, subscriptionID uint, fingerprint string) error {
	return nil
}

func newHandler() *webhook.Handler {
	return webhook.NewHandler(testSecret, &StubSubService{}, &StubLicenseService{}, NewFakeIdempotencyStore())
}

func newHandlerWithSub(subSvc *StubSubService) *webhook.Handler {
	return webhook.NewHandler(testSecret, subSvc, &StubLicenseService{}, NewFakeIdempotencyStore())
}

func postJSON(handler http.HandlerFunc, token string, body interface{}) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("x-callback-token", token)
	}
	rr := httptest.NewRecorder()
	handler(rr, req)
	return rr
}

// --- HandleFirstPayment ---

func TestHandleFirstPayment_InvalidToken(t *testing.T) {
	rr := postJSON(newHandler().HandleFirstPayment, "wrong-token", map[string]interface{}{})
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestHandleFirstPayment_NonPaidStatus(t *testing.T) {
	payload := map[string]interface{}{
		"status":      "PENDING",
		"external_id": "loqa-sub-1-starter-monthly",
	}
	rr := postJSON(newHandler().HandleFirstPayment, testSecret, payload)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleFirstPayment_MissingExternalID(t *testing.T) {
	payload := map[string]interface{}{
		"status":      "PAID",
		"external_id": "",
	}
	rr := postJSON(newHandler().HandleFirstPayment, testSecret, payload)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleFirstPayment_Valid(t *testing.T) {
	paidAt := time.Now()
	payload := map[string]interface{}{
		"status":      "PAID",
		"paid_at":     paidAt,
		"external_id": "loqa-sub-1-starter-monthly",
	}
	rr := postJSON(newHandler().HandleFirstPayment, testSecret, payload)
	assert.Equal(t, http.StatusOK, rr.Code)
}

// --- HandleXenditRecurring ---

func TestHandleRecurring_InvalidToken(t *testing.T) {
	rr := postJSON(newHandler().HandleXenditRecurring, "wrong-token", map[string]interface{}{})
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestHandleRecurring_NonSucceededEvent(t *testing.T) {
	payload := map[string]interface{}{
		"event":           "recurring.cycle.failed",
		"subscription_id": 1,
	}
	rr := postJSON(newHandler().HandleXenditRecurring, testSecret, payload)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleRecurring_MissingSubscriptionID(t *testing.T) {
	payload := map[string]interface{}{
		"event":           "recurring.cycle.succeeded",
		"subscription_id": 0,
	}
	rr := postJSON(newHandler().HandleXenditRecurring, testSecret, payload)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleRecurring_Valid(t *testing.T) {
	paidAt := time.Now()
	payload := map[string]interface{}{
		"event":           "recurring.cycle.succeeded",
		"subscription_id": float64(1),
		"paid_at":         paidAt,
	}
	rr := postJSON(newHandler().HandleXenditRecurring, testSecret, payload)
	assert.Equal(t, http.StatusOK, rr.Code)
}

// --- Idempotency (duplicate webhook delivery) ---

func TestHandleFirstPayment_DuplicateEventID_CreatesSubscriptionOnce(t *testing.T) {
	subSvc := &StubSubService{}
	handler := newHandlerWithSub(subSvc)

	payload := map[string]interface{}{
		"id":          "invoice-evt-123",
		"status":      "PAID",
		"paid_at":     time.Now(),
		"external_id": "loqa-sub-1-starter-monthly",
	}

	rr1 := postJSON(handler.HandleFirstPayment, testSecret, payload)
	assert.Equal(t, http.StatusOK, rr1.Code)

	// Xendit redelivers the same event (retry on timeout, etc.)
	rr2 := postJSON(handler.HandleFirstPayment, testSecret, payload)
	assert.Equal(t, http.StatusOK, rr2.Code, "duplicate delivery must still return 200 so Xendit stops retrying")

	assert.Equal(t, 1, subSvc.CreateCalls, "subscription must only be created once despite duplicate delivery")
}

func TestHandleFirstPayment_NoEventID_StillProcesses(t *testing.T) {
	// Payloads without an "id" field (e.g. older/minimal test fixtures) must
	// still be processed — idempotency is skipped, not treated as an error.
	payload := map[string]interface{}{
		"status":      "PAID",
		"paid_at":     time.Now(),
		"external_id": "loqa-sub-1-starter-monthly",
	}
	rr := postJSON(newHandler().HandleFirstPayment, testSecret, payload)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleRecurring_DuplicateEventID_ExtendsOnce(t *testing.T) {
	subSvc := &StubSubService{}
	handler := newHandlerWithSub(subSvc)

	payload := map[string]interface{}{
		"id":              "recurring-evt-456",
		"event":           "recurring.cycle.succeeded",
		"subscription_id": float64(1),
		"paid_at":         time.Now(),
	}

	rr1 := postJSON(handler.HandleXenditRecurring, testSecret, payload)
	assert.Equal(t, http.StatusOK, rr1.Code)

	rr2 := postJSON(handler.HandleXenditRecurring, testSecret, payload)
	assert.Equal(t, http.StatusOK, rr2.Code, "duplicate delivery must still return 200 so Xendit stops retrying")

	assert.Equal(t, 1, subSvc.ExtendCalls, "subscription must only be extended once despite duplicate delivery")
}
