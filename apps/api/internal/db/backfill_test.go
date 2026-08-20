package db_test

import (
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

func setupBackfillDB(t *testing.T) *gorm.DB {
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

func TestBackfillModuleDefaults_PopulatesEmptyModules(t *testing.T) {
	gormDB := setupBackfillDB(t)

	p := &plan.Plan{Tier: "backfill-test-business", IncludedSeats: 5, ExtraSeatPrice: 50000}
	require.NoError(t, gormDB.Create(p).Error)
	t.Cleanup(func() { gormDB.Delete(p) })

	sub := &subscription.Subscription{
		UserID:   9999,
		Tier:     plan.TierBusiness,
		Cycle:    plan.CycleMonthly,
		Status:   subscription.SubscriptionStatusActive,
		StartsAt: time.Now(),
	}
	require.NoError(t, gormDB.Create(sub).Error)
	t.Cleanup(func() { gormDB.Delete(sub) })

	require.NoError(t, db.BackfillModuleDefaults(gormDB))

	var reloadedSub subscription.Subscription
	require.NoError(t, gormDB.First(&reloadedSub, sub.ID).Error)
	assert.ElementsMatch(t, []string{"chat", "finance", "finance.pl", "inventory", "order", "project"}, []string(reloadedSub.Modules))
	assert.Equal(t, plan.AppScopeBoth, reloadedSub.AppScope)
}

func TestBackfillModuleDefaults_SkipsAlreadyPopulated(t *testing.T) {
	gormDB := setupBackfillDB(t)

	sub := &subscription.Subscription{
		UserID:   9999,
		Tier:     plan.TierStarter,
		Cycle:    plan.CycleMonthly,
		Status:   subscription.SubscriptionStatusActive,
		StartsAt: time.Now(),
		Modules:  plan.StringArray{"custom-module-already-set"},
		AppScope: plan.AppScopeBusiness,
	}
	require.NoError(t, gormDB.Create(sub).Error)
	t.Cleanup(func() { gormDB.Delete(sub) })

	require.NoError(t, db.BackfillModuleDefaults(gormDB))

	var reloadedSub subscription.Subscription
	require.NoError(t, gormDB.First(&reloadedSub, sub.ID).Error)
	// Must NOT be overwritten by the starter-tier default — already had a value.
	assert.Equal(t, []string{"custom-module-already-set"}, []string(reloadedSub.Modules))
	assert.Equal(t, plan.AppScopeBusiness, reloadedSub.AppScope)
}

func TestBackfillModuleDefaults_UnknownTier_LeftAlone(t *testing.T) {
	gormDB := setupBackfillDB(t)

	p := &plan.Plan{Tier: "custom-promo-tier", IncludedSeats: 3, ExtraSeatPrice: 0}
	require.NoError(t, gormDB.Create(p).Error)
	t.Cleanup(func() { gormDB.Delete(p) })

	require.NoError(t, db.BackfillModuleDefaults(gormDB))

	var reloaded plan.Plan
	require.NoError(t, gormDB.First(&reloaded, p.ID).Error)
	assert.Empty(t, reloaded.Modules, "unknown/custom tier has no default mapping — admin API is expected to set modules explicitly")
}
