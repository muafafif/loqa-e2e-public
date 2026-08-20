package license_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/joho/godotenv"
	"github.com/loqa/api/internal/db"
	"github.com/loqa/api/internal/device"
	"github.com/loqa/api/internal/license"
	"github.com/loqa/api/internal/plan"
	"github.com/loqa/api/internal/subscription"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupDB(t *testing.T) *gorm.DB {
	t.Helper()
	_ = godotenv.Load("../../.env")
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	gormDB, err := db.Connect(dsn)
	require.NoError(t, err)
	require.NoError(t, db.Migrate(gormDB))
	return gormDB
}

func setupSigner(t *testing.T) *license.Signer {
	t.Helper()
	_ = godotenv.Load("../../.env")
	pk := os.Getenv("LICENSE_PRIVATE_KEY")
	require.NotEmpty(t, pk, "LICENSE_PRIVATE_KEY not set")
	signer, err := license.NewSigner(pk)
	require.NoError(t, err)
	return signer
}

func seedFixtures(t *testing.T, gormDB *gorm.DB) (lk *license.LicenseKey, cleanup func()) {
	return seedFixturesWithTier(t, gormDB, plan.TierStarter)
}

func seedFixturesWithTier(t *testing.T, gormDB *gorm.DB, tier plan.Tier) (lk *license.LicenseKey, cleanup func()) {
	t.Helper()

	seats := map[plan.Tier]int{plan.TierStarter: 1, plan.TierPro: 1, plan.TierBusiness: 5}
	p := &plan.Plan{Tier: tier, IncludedSeats: seats[tier], ExtraSeatPrice: 20000}
	require.NoError(t, gormDB.FirstOrCreate(p, plan.Plan{Tier: tier}).Error)

	now := time.Now()
	exp := now.AddDate(0, 1, 0)
	sub := &subscription.Subscription{
		UserID:    9999,
		Tier:      tier,
		Cycle:     plan.CycleMonthly,
		Status:    subscription.SubscriptionStatusActive,
		StartsAt:  now,
		ExpiresAt: &exp,
	}
	require.NoError(t, gormDB.Create(sub).Error)

	lk = &license.LicenseKey{
		Key:            fmt.Sprintf("LOQA-test-%d-intg", sub.ID),
		SubscriptionID: sub.ID,
		Status:         license.StatusActive,
	}
	require.NoError(t, gormDB.Create(lk).Error)

	cleanup = func() {
		gormDB.Where("license_key_id = ?", lk.ID).Delete(&device.Activation{})
		gormDB.Delete(lk)
		gormDB.Delete(sub)
	}
	return lk, cleanup
}

func newSvc(gormDB *gorm.DB, signer *license.Signer) license.Service {
	return license.NewService(
		license.NewRepository(gormDB),
		subscription.NewRepository(gormDB),
		plan.NewRepository(gormDB),
		device.NewRepository(gormDB),
		signer,
		30,
	)
}

func TestIntegration_Activate_Valid(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)
	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")

	require.NoError(t, err)
	assert.NotEmpty(t, token)

	var act device.Activation
	err = gormDB.Where("license_key_id = ? AND fingerprint = ?", lk.ID, "fp-device-001").First(&act).Error
	require.NoError(t, err)
	assert.Equal(t, device.StatusActive, act.Status)
}

func TestIntegration_Activate_Reactivation(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)
	_, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	// Same fingerprint again — should succeed, no duplicate
	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	var count int64
	gormDB.Model(&device.Activation{}).Where("license_key_id = ? AND fingerprint = ?", lk.ID, "fp-device-001").Count(&count)
	assert.Equal(t, int64(1), count)
}

func TestIntegration_Activate_SeatLimitReached(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)

	// Starter = 1 seat; first device fills it
	_, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	// Second device should be rejected
	_, err = svc.Activate(context.Background(), lk.Key, "fp-device-002")
	assert.ErrorIs(t, err, device.ErrSeatLimitReached)
}

func TestIntegration_Activate_MultiSeat_WithinLimit(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	// Business tier has 5 included seats
	lk, cleanup := seedFixturesWithTier(t, gormDB, plan.TierBusiness)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)

	for i := 1; i <= 5; i++ {
		fp := fmt.Sprintf("fp-business-device-%03d", i)
		token, err := svc.Activate(context.Background(), lk.Key, fp)
		require.NoError(t, err, "device %d should activate", i)
		assert.NotEmpty(t, token)
	}
}

func TestIntegration_Activate_MultiSeat_ExceedsLimit(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixturesWithTier(t, gormDB, plan.TierBusiness)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)

	// Fill all 5 seats
	for i := 1; i <= 5; i++ {
		fp := fmt.Sprintf("fp-business-device-%03d", i)
		_, err := svc.Activate(context.Background(), lk.Key, fp)
		require.NoError(t, err)
	}

	// 6th device should be rejected
	_, err := svc.Activate(context.Background(), lk.Key, "fp-business-device-006")
	assert.ErrorIs(t, err, device.ErrSeatLimitReached)
}

func TestIntegration_Activate_InvalidKey(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)

	svc := newSvc(gormDB, signer)
	_, err := svc.Activate(context.Background(), "LOQA-fake-fake-fake-fake", "fp-device-001")
	assert.Error(t, err)
}

func TestIntegration_Activate_ExpiredSubscription(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)

	past := time.Now().Add(-24 * time.Hour)
	sub := &subscription.Subscription{
		UserID:    9999,
		Tier:      plan.TierStarter,
		Cycle:     plan.CycleMonthly,
		Status:    subscription.SubscriptionStatusExpired,
		StartsAt:  past.AddDate(0, -1, 0),
		ExpiresAt: &past,
	}
	require.NoError(t, gormDB.Create(sub).Error)
	lk := &license.LicenseKey{
		Key:            fmt.Sprintf("LOQA-test-%d-exp", sub.ID),
		SubscriptionID: sub.ID,
		Status:         license.StatusActive,
	}
	require.NoError(t, gormDB.Create(lk).Error)
	t.Cleanup(func() {
		gormDB.Delete(lk)
		gormDB.Delete(sub)
	})

	svc := newSvc(gormDB, signer)
	_, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	assert.Error(t, err)
}

func TestIntegration_Activate_RevokedKey(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	lk.Status = license.StatusRevoked
	require.NoError(t, gormDB.Save(lk).Error)

	svc := newSvc(gormDB, signer)
	_, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	assert.Error(t, err)
}

func TestIntegration_Activate_CancelledSubscription(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	gormDB.Model(&subscription.Subscription{}).Where("id = ?", lk.SubscriptionID).
		Update("status", subscription.SubscriptionStatusCancelled)

	svc := newSvc(gormDB, signer)
	_, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	assert.Error(t, err)
}

func TestIntegration_Activate_Lifetime(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)

	sub := &subscription.Subscription{
		UserID:    9999,
		Tier:      plan.TierStarter,
		Cycle:     plan.CycleLifetime,
		Status:    subscription.SubscriptionStatusActive,
		StartsAt:  time.Now(),
		ExpiresAt: nil,
	}
	require.NoError(t, gormDB.Create(sub).Error)
	lk := &license.LicenseKey{
		Key:            fmt.Sprintf("LOQA-test-%d-life", sub.ID),
		SubscriptionID: sub.ID,
		Status:         license.StatusActive,
	}
	require.NoError(t, gormDB.Create(lk).Error)
	t.Cleanup(func() {
		gormDB.Where("license_key_id = ?", lk.ID).Delete(&device.Activation{})
		gormDB.Delete(lk)
		gormDB.Delete(sub)
	})

	svc := newSvc(gormDB, signer)
	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
}

func TestIntegration_Activate_ConcurrentExceedsSeat_OnlyOneSucceeds(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	// Starter = 1 seat.
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)

	const attempts = 8
	var wg sync.WaitGroup
	errs := make([]error, attempts)

	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			fp := fmt.Sprintf("fp-concurrent-%03d", i)
			_, err := svc.Activate(context.Background(), lk.Key, fp)
			errs[i] = err
		}(i)
	}
	wg.Wait()

	successes, seatLimitErrs := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, device.ErrSeatLimitReached):
			seatLimitErrs++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}

	assert.Equal(t, 1, successes, "exactly one concurrent activation should win the single seat")
	assert.Equal(t, attempts-1, seatLimitErrs)

	var count int64
	gormDB.Model(&device.Activation{}).Where("license_key_id = ? AND status = ?", lk.ID, device.StatusActive).Count(&count)
	assert.Equal(t, int64(1), count, "only one active device row should exist in the DB")
}

func TestIntegration_Activate_ExtraSeats(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	// Add 1 extra seat → total 2 seats for starter
	gormDB.Model(&subscription.Subscription{}).Where("id = ?", lk.SubscriptionID).
		Update("extra_seats", 1)

	svc := newSvc(gormDB, signer)

	_, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	// 2nd device should succeed (extra seat)
	_, err = svc.Activate(context.Background(), lk.Key, "fp-device-002")
	require.NoError(t, err)

	// 3rd device should fail
	_, err = svc.Activate(context.Background(), lk.Key, "fp-device-003")
	assert.ErrorIs(t, err, device.ErrSeatLimitReached)
}

// --- Validate ---

func TestIntegration_Validate_Valid(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)

	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	fresh, err := svc.Validate(context.Background(), token)
	require.NoError(t, err)
	assert.NotEmpty(t, fresh)
}

func TestIntegration_Validate_RevokedKey(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)
	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	lk.Status = license.StatusRevoked
	require.NoError(t, gormDB.Save(lk).Error)

	_, err = svc.Validate(context.Background(), token)
	assert.Error(t, err)
}

func TestIntegration_Validate_DeactivatedDevice(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)
	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	gormDB.Model(&device.Activation{}).
		Where("license_key_id = ? AND fingerprint = ?", lk.ID, "fp-device-001").
		Update("status", device.StatusDeactivated)

	_, err = svc.Validate(context.Background(), token)
	assert.Error(t, err)
}

func TestIntegration_Validate_ExpiredSubscription(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)
	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	past := time.Now().Add(-time.Hour)
	gormDB.Model(&subscription.Subscription{}).Where("id = ?", lk.SubscriptionID).
		Updates(map[string]interface{}{"expires_at": past, "status": subscription.SubscriptionStatusExpired})

	_, err = svc.Validate(context.Background(), token)
	assert.Error(t, err)
}

func TestIntegration_Validate_ExpiredJWT(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	// Activate with offlineDays=-1 so the JWT exp is already in the past.
	expiredSvc := license.NewService(
		license.NewRepository(gormDB),
		subscription.NewRepository(gormDB),
		plan.NewRepository(gormDB),
		device.NewRepository(gormDB),
		signer,
		-1,
	)
	expiredToken, err := expiredSvc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	svc := newSvc(gormDB, signer)
	_, err = svc.Validate(context.Background(), expiredToken)
	assert.Error(t, err)
}

func TestIntegration_Validate_InvalidToken(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)

	svc := newSvc(gormDB, signer)
	_, err := svc.Validate(context.Background(), "not-a-real-token")
	assert.Error(t, err)
}

func TestIntegration_RevokeDevice_PendingCompletes(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)
	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	// Phase 1: admin marks device as revoke_pending
	require.NoError(t, svc.RevokeDevice(context.Background(), lk.SubscriptionID, "fp-device-001"))

	var act device.Activation
	require.NoError(t, gormDB.Where("license_key_id = ? AND fingerprint = ?", lk.ID, "fp-device-001").First(&act).Error)
	assert.Equal(t, device.StatusRevokePending, act.Status)

	// License key still active — other devices unaffected
	var updatedKey license.LicenseKey
	require.NoError(t, gormDB.First(&updatedKey, lk.ID).Error)
	assert.Equal(t, license.StatusActive, updatedKey.Status)

	// Phase 2: device comes online → validate completes revocation
	_, err = svc.Validate(context.Background(), token)
	assert.ErrorIs(t, err, license.ErrDeviceRevoked)

	require.NoError(t, gormDB.Where("license_key_id = ? AND fingerprint = ?", lk.ID, "fp-device-001").First(&act).Error)
	assert.Equal(t, device.StatusDeactivated, act.Status)
}

func TestIntegration_RevokeDevice_Phase2_SeatFreed(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB) // Starter = 1 seat
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)

	// Fill the only seat
	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	// Phase 1 + Phase 2: revoke and device comes online
	require.NoError(t, svc.RevokeDevice(context.Background(), lk.SubscriptionID, "fp-device-001"))
	_, err = svc.Validate(context.Background(), token)
	assert.ErrorIs(t, err, license.ErrDeviceRevoked)

	// Seat is now freed — a new device should be able to activate
	_, err = svc.Activate(context.Background(), lk.Key, "fp-device-002")
	assert.NoError(t, err)
}

func TestIntegration_RevokeDevice_Phase2_SubsequentValidateFails(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)
	token, err := svc.Activate(context.Background(), lk.Key, "fp-device-001")
	require.NoError(t, err)

	// Phase 1 + Phase 2
	require.NoError(t, svc.RevokeDevice(context.Background(), lk.SubscriptionID, "fp-device-001"))
	_, err = svc.Validate(context.Background(), token)
	assert.ErrorIs(t, err, license.ErrDeviceRevoked)

	// Subsequent validate: device is deactivated, not revoke_pending — must not return ErrDeviceRevoked again
	_, err = svc.Validate(context.Background(), token)
	assert.Error(t, err)
	assert.NotErrorIs(t, err, license.ErrDeviceRevoked)
}

func TestIntegration_RevokeDevice_NotFound(t *testing.T) {
	gormDB := setupDB(t)
	signer := setupSigner(t)
	lk, cleanup := seedFixtures(t, gormDB)
	t.Cleanup(cleanup)

	svc := newSvc(gormDB, signer)
	err := svc.RevokeDevice(context.Background(), lk.SubscriptionID, "fp-nonexistent")
	assert.Error(t, err)
}
