package subscription_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/joho/godotenv"
	"github.com/loqa/api/internal/db"
	"github.com/loqa/api/internal/plan"
	"github.com/loqa/api/internal/subscription"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupIntegrationDB(t *testing.T) *gorm.DB {
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

func newIntegrationSvc(gormDB *gorm.DB) subscription.Service {
	// nil planRepo/payment: this file only exercises Extend(), which touches neither.
	return subscription.NewService(subscription.NewRepository(gormDB), nil, nil)
}

func seedSub(t *testing.T, gormDB *gorm.DB, cycle plan.Cycle, expiresAt *time.Time) *subscription.Subscription {
	t.Helper()
	sub := &subscription.Subscription{
		UserID:    9999,
		Tier:      plan.TierStarter,
		Cycle:     cycle,
		Status:    subscription.SubscriptionStatusActive,
		StartsAt:  time.Now(),
		ExpiresAt: expiresAt,
	}
	require.NoError(t, gormDB.Create(sub).Error)
	t.Cleanup(func() { gormDB.Delete(sub) })
	return sub
}

func TestIntegration_Extend_Monthly(t *testing.T) {
	gormDB := setupIntegrationDB(t)
	exp := time.Now().Add(10 * 24 * time.Hour) // 10 days left
	sub := seedSub(t, gormDB, plan.CycleMonthly, &exp)

	updated, err := newIntegrationSvc(gormDB).Extend(context.Background(), sub.ID, time.Now())

	require.NoError(t, err)
	require.NotNil(t, updated.ExpiresAt)
	assert.WithinDuration(t, exp.AddDate(0, 1, 0), *updated.ExpiresAt, time.Second)
	assert.Equal(t, subscription.SubscriptionStatusActive, updated.Status)
}

func TestIntegration_Extend_Yearly(t *testing.T) {
	gormDB := setupIntegrationDB(t)
	exp := time.Now().Add(30 * 24 * time.Hour) // 30 days left
	sub := seedSub(t, gormDB, plan.CycleYearly, &exp)

	updated, err := newIntegrationSvc(gormDB).Extend(context.Background(), sub.ID, time.Now())

	require.NoError(t, err)
	require.NotNil(t, updated.ExpiresAt)
	assert.WithinDuration(t, exp.AddDate(1, 0, 0), *updated.ExpiresAt, time.Second)
}

func TestIntegration_Extend_Lapsed(t *testing.T) {
	gormDB := setupIntegrationDB(t)
	// Subscription already expired
	past := time.Now().Add(-5 * 24 * time.Hour)
	sub := seedSub(t, gormDB, plan.CycleMonthly, &past)
	gormDB.Model(sub).Update("status", subscription.SubscriptionStatusExpired)
	sub.Status = subscription.SubscriptionStatusExpired

	paidAt := time.Now()
	updated, err := newIntegrationSvc(gormDB).Extend(context.Background(), sub.ID, paidAt)

	require.NoError(t, err)
	require.NotNil(t, updated.ExpiresAt)
	// Should extend from paidAt, not from past expiry
	assert.WithinDuration(t, paidAt.AddDate(0, 1, 0), *updated.ExpiresAt, time.Second)
	assert.Equal(t, subscription.SubscriptionStatusActive, updated.Status)
}

func TestIntegration_Extend_Lifetime(t *testing.T) {
	gormDB := setupIntegrationDB(t)
	sub := seedSub(t, gormDB, plan.CycleLifetime, nil)

	updated, err := newIntegrationSvc(gormDB).Extend(context.Background(), sub.ID, time.Now())

	require.NoError(t, err)
	assert.Nil(t, updated.ExpiresAt)
	assert.Equal(t, subscription.SubscriptionStatusActive, updated.Status)
}
