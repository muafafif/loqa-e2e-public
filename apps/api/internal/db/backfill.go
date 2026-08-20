package db

import (
	"fmt"

	"github.com/loqa/api/internal/plan"
	"github.com/loqa/api/internal/subscription"
	"gorm.io/gorm"
)

type tierDefaults struct {
	Modules  plan.StringArray
	AppScope plan.AppScope
}

// Mirrors the tier feature matrix documented in CLAUDE.md § Feature Gating by Tier.
var tierModuleDefaults = map[plan.Tier]tierDefaults{
	plan.TierStarter: {
		Modules:  plan.StringArray{"chat", "finance"},
		AppScope: plan.AppScopePersonal,
	},
	plan.TierPro: {
		Modules:  plan.StringArray{"chat", "finance", "finance.pl"},
		AppScope: plan.AppScopeBoth,
	},
	plan.TierBusiness: {
		Modules:  plan.StringArray{"chat", "finance", "finance.pl", "inventory", "order", "project"},
		AppScope: plan.AppScopeBoth,
	},
}

// BackfillModuleDefaults fills in Modules (and corrects AppScope) for plan/
// subscription rows created before those columns existed. Idempotent — only
// touches rows whose Modules is still empty — so it's safe to call on every
// startup right after Migrate(). Rows on a tier not in tierModuleDefaults
// (i.e. a custom tier created later via the admin API) are left alone; the
// admin API is expected to set Modules/AppScope explicitly for those.
func BackfillModuleDefaults(gormDB *gorm.DB) error {
	var plans []plan.Plan
	if err := gormDB.Find(&plans).Error; err != nil {
		return fmt.Errorf("backfill: load plans: %w", err)
	}
	for _, p := range plans {
		if len(p.Modules) > 0 {
			continue
		}
		defaults, ok := tierModuleDefaults[p.Tier]
		if !ok {
			continue
		}
		err := gormDB.Model(&plan.Plan{}).Where("id = ?", p.ID).
			Updates(map[string]interface{}{"modules": defaults.Modules, "app_scope": defaults.AppScope}).Error
		if err != nil {
			return fmt.Errorf("backfill: update plan %d: %w", p.ID, err)
		}
	}

	var subs []subscription.Subscription
	if err := gormDB.Find(&subs).Error; err != nil {
		return fmt.Errorf("backfill: load subscriptions: %w", err)
	}
	for _, s := range subs {
		if len(s.Modules) > 0 {
			continue
		}
		defaults, ok := tierModuleDefaults[s.Tier]
		if !ok {
			continue
		}
		err := gormDB.Model(&subscription.Subscription{}).Where("id = ?", s.ID).
			Updates(map[string]interface{}{"modules": defaults.Modules, "app_scope": defaults.AppScope}).Error
		if err != nil {
			return fmt.Errorf("backfill: update subscription %d: %w", s.ID, err)
		}
	}

	return nil
}
