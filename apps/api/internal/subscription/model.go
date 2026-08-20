package subscription

import (
	"time"

	"github.com/loqa/api/internal/plan"
)

type SubscriptionStatus string

const (
	SubscriptionStatusActive    SubscriptionStatus = "active"
	SubscriptionStatusExpired   SubscriptionStatus = "expired"
	SubscriptionStatusCancelled SubscriptionStatus = "cancelled"
	SubscriptionStatusRevoked   SubscriptionStatus = "revoked"
)

type Subscription struct {
	ID         uint               `json:"id" gorm:"primaryKey;autoIncrement"`
	UserID     uint               `json:"user_id" gorm:"not null;index"`
	Tier       plan.Tier          `json:"tier" gorm:"not null"`
	Cycle      plan.Cycle         `json:"cycle" gorm:"not null"`
	ExtraSeats int                `json:"extra_seats" gorm:"not null;default:0"`
	Status     SubscriptionStatus `json:"status" gorm:"not null;default:'active'"`
	StartsAt   time.Time          `json:"starts_at" gorm:"not null"`
	ExpiresAt  *time.Time         `json:"expires_at"`
	// Modules/AppScope are snapshotted from the plan at subscription-create time
	// (self-checkout) or set directly by the admin API for custom/promo grants.
	// See comments on plan.Plan.Modules/AppScope for why one is nullable and the
	// other isn't.
	Modules   plan.StringArray `json:"modules" gorm:"type:jsonb"`
	AppScope  plan.AppScope    `json:"app_scope" gorm:"not null;default:'both'"`
	CreatedAt time.Time        `json:"created_at"`
	UpdatedAt time.Time        `json:"updated_at"`
}
