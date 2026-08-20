package license

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/loqa/api/internal/device"
	"github.com/loqa/api/internal/plan"
	"github.com/loqa/api/internal/subscription"
)

type Service interface {
	Activate(ctx context.Context, key, fingerprint string) (string, error)
	Validate(ctx context.Context, tokenStr string) (string, error)
	Generate(ctx context.Context, subscriptionID uint) (*LicenseKey, error)
	GetBySubscriptionID(ctx context.Context, subscriptionID uint) (*LicenseKey, error)
	GetByKey(ctx context.Context, key string) (*LicenseKey, error)
	Revoke(ctx context.Context, subscriptionID uint) error
	RevokeDevice(ctx context.Context, subscriptionID uint, fingerprint string) error
}

type service struct {
	repo        Repository
	subRepo     subscription.Repository
	planRepo    plan.Repository
	deviceRepo  device.Repository
	signer      *Signer
	offlineDays int
}

func NewService(repo Repository, subRepo subscription.Repository, planRepo plan.Repository, deviceRepo device.Repository, signer *Signer, offlineDays int) Service {
	return &service{
		repo:        repo,
		subRepo:     subRepo,
		planRepo:    planRepo,
		deviceRepo:  deviceRepo,
		signer:      signer,
		offlineDays: offlineDays,
	}
}

func (s *service) Activate(ctx context.Context, key, fingerprint string) (string, error) {
	lk, err := s.repo.GetByKey(ctx, key)
	if err != nil || lk.Status != StatusActive {
		return "", fmt.Errorf("invalid license key")
	}

	sub, err := s.subRepo.GetByID(ctx, lk.SubscriptionID)
	if err != nil {
		return "", fmt.Errorf("subscription not found")
	}

	if sub.Status != subscription.SubscriptionStatusActive {
		return "", fmt.Errorf("subscription inactive")
	}

	if sub.ExpiresAt != nil && sub.ExpiresAt.Before(time.Now()) {
		return "", fmt.Errorf("subscription expired")
	}

	p, err := s.planRepo.GetPlan(ctx, sub.Tier)
	if err != nil {
		return "", fmt.Errorf("plan not found")
	}

	// Sign before writing to DB so a signing failure doesn't leave a dangling activation record.
	token, err := s.signer.Sign(lk.Key, sub.Tier, sub.ExpiresAt, fingerprint, s.offlineDays, sub.Modules, sub.AppScope)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}

	if _, err := s.deviceRepo.ActivateWithSeatCheck(ctx, lk.ID, fingerprint, p.IncludedSeats+sub.ExtraSeats); err != nil {
		return "", err
	}

	return token, nil
}

// Validate checks the token is still valid server-side and returns a fresh one.
// Returning a new token resets the offline grace period (exp), so the app can
// stay offline for another LICENSE_OFFLINE_DAYS without re-validating. If the
// server is unreachable, the app falls back to the cached token until it expires.
func (s *service) Validate(ctx context.Context, tokenStr string) (string, error) {
	claims, err := s.signer.Verify(tokenStr)
	if err != nil {
		return "", fmt.Errorf("invalid token: %w", err)
	}

	lk, err := s.repo.GetByKey(ctx, claims.LicenseKey)
	if err != nil || lk.Status != StatusActive {
		return "", fmt.Errorf("license key inactive")
	}

	sub, err := s.subRepo.GetByID(ctx, lk.SubscriptionID)
	if err != nil {
		return "", fmt.Errorf("subscription not found")
	}

	if sub.Status != subscription.SubscriptionStatusActive {
		return "", fmt.Errorf("subscription inactive")
	}

	if sub.ExpiresAt != nil && sub.ExpiresAt.Before(time.Now()) {
		return "", fmt.Errorf("subscription expired")
	}

	activation, err := s.deviceRepo.GetByFingerprint(ctx, lk.ID, claims.Fingerprint)
	if err != nil {
		return "", fmt.Errorf("device not authorized")
	}

	// Phase 2: device came online — complete pending revocation.
	if activation.Status == device.StatusRevokePending {
		activation.Status = device.StatusDeactivated
		_ = s.deviceRepo.Update(ctx, activation)
		return "", ErrDeviceRevoked
	}

	if activation.Status != device.StatusActive {
		return "", fmt.Errorf("device not authorized")
	}

	activation.LastSeenAt = time.Now()
	_ = s.deviceRepo.Update(ctx, activation) // non-fatal: fresh token is still valid if this fails

	return s.signer.Sign(lk.Key, sub.Tier, sub.ExpiresAt, claims.Fingerprint, s.offlineDays, sub.Modules, sub.AppScope)
}

func (s *service) Generate(ctx context.Context, subscriptionID uint) (*LicenseKey, error) {
	key, err := generateKey()
	if err != nil {
		return nil, fmt.Errorf("generate key: %w", err)
	}

	lk := &LicenseKey{
		Key:            key,
		SubscriptionID: subscriptionID,
		Status:         StatusActive,
	}

	if err := s.repo.Create(ctx, lk); err != nil {
		return nil, fmt.Errorf("save license key: %w", err)
	}

	return lk, nil
}

func (s *service) GetBySubscriptionID(ctx context.Context, subscriptionID uint) (*LicenseKey, error) {
	return s.repo.GetBySubscriptionID(ctx, subscriptionID)
}

func (s *service) GetByKey(ctx context.Context, key string) (*LicenseKey, error) {
	return s.repo.GetByKey(ctx, key)
}

func (s *service) Revoke(ctx context.Context, subscriptionID uint) error {
	lk, err := s.repo.GetBySubscriptionID(ctx, subscriptionID)
	if err != nil {
		return err
	}
	lk.Status = StatusRevoked
	return s.repo.Update(ctx, lk)
}

func (s *service) RevokeDevice(ctx context.Context, subscriptionID uint, fingerprint string) error {
	lk, err := s.repo.GetBySubscriptionID(ctx, subscriptionID)
	if err != nil {
		return fmt.Errorf("license key not found: %w", err)
	}

	activation, err := s.deviceRepo.GetByFingerprint(ctx, lk.ID, fingerprint)
	if err != nil {
		return fmt.Errorf("device not found: %w", err)
	}
	if activation.Status != device.StatusActive {
		return fmt.Errorf("device not active")
	}

	activation.Status = device.StatusRevokePending
	return s.deviceRepo.Update(ctx, activation)
}

func generateKey() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	h := hex.EncodeToString(b)
	return fmt.Sprintf("LOQA-%s-%s-%s-%s", h[0:4], h[4:8], h[8:12], h[12:16]), nil
}
