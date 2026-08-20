package plan

import (
	"context"
	"fmt"

	"gorm.io/gorm"
)

type Repository interface {
	GetPricing(ctx context.Context, tier Tier, cycle Cycle) (*Pricing, error)
	GetPlan(ctx context.Context, tier Tier) (*Plan, error)
	UpsertPlan(ctx context.Context, p *Plan) error
	UpsertPricing(ctx context.Context, p *Pricing) error
}

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db}
}

func (r *repository) GetPricing(ctx context.Context, tier Tier, cycle Cycle) (*Pricing, error) {
	var p Pricing
	if err := r.db.WithContext(ctx).Where("tier = ? AND cycle = ?", tier, cycle).First(&p).Error; err != nil {
		return nil, fmt.Errorf("pricing not found for tier=%s cycle=%s: %w", tier, cycle, err)
	}
	return &p, nil
}

func (r *repository) GetPlan(ctx context.Context, tier Tier) (*Plan, error) {
	var p Plan
	if err := r.db.WithContext(ctx).Where("tier = ?", tier).First(&p).Error; err != nil {
		return nil, fmt.Errorf("plan not found for tier=%s: %w", tier, err)
	}
	return &p, nil
}

func (r *repository) UpsertPlan(ctx context.Context, p *Plan) error {
	return r.db.WithContext(ctx).
		Where(Plan{Tier: p.Tier}).
		Assign(Plan{IncludedSeats: p.IncludedSeats, ExtraSeatPrice: p.ExtraSeatPrice}).
		FirstOrCreate(p).Error
}

func (r *repository) UpsertPricing(ctx context.Context, p *Pricing) error {
	return r.db.WithContext(ctx).
		Where(Pricing{Tier: p.Tier, Cycle: p.Cycle}).
		Assign(Pricing{Price: p.Price}).
		FirstOrCreate(p).Error
}
