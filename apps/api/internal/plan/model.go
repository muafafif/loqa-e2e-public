package plan

import "time"

type Tier string

const (
	TierStarter  Tier = "starter"
	TierPro      Tier = "pro"
	TierBusiness Tier = "business"
)

type Cycle string

const (
	CycleMonthly  Cycle = "monthly"
	CycleYearly   Cycle = "yearly"
	CycleLifetime Cycle = "lifetime"
)

type Plan struct {
	ID             uint    `json:"id" gorm:"primaryKey;autoIncrement"`
	Tier           Tier    `json:"tier" gorm:"uniqueIndex;not null"`
	IncludedSeats  int     `json:"included_seats" gorm:"not null"`
	ExtraSeatPrice float64 `json:"extra_seat_price" gorm:"not null"`
	// Modules/AppScope define what a license generated from this plan grants.
	// Modules is nullable (StringArray.Scan handles NULL → empty slice) and
	// backfilled per-tier by db.BackfillModuleDefaults(). AppScope has a DB
	// default ('both') so it's never NULL — plain string fields can't safely
	// scan SQL NULL without a pointer/sql.NullString, so this avoids that.
	Modules   StringArray `json:"modules" gorm:"type:jsonb"`
	AppScope  AppScope    `json:"app_scope" gorm:"not null;default:'both'"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
}

type Pricing struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Tier      Tier      `json:"tier" gorm:"not null;uniqueIndex:idx_tier_cycle"`
	Cycle     Cycle     `json:"cycle" gorm:"not null;uniqueIndex:idx_tier_cycle"`
	Price     float64   `json:"price" gorm:"not null"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
