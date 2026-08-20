package subscription

import (
	"context"
	"fmt"
	"time"

	"github.com/loqa/api/internal/payment"
	"github.com/loqa/api/internal/plan"
)

type Service interface {
	Create(ctx context.Context, userID uint, tier plan.Tier, cycle plan.Cycle, startsAt time.Time) (*Subscription, error)
	Extend(ctx context.Context, subscriptionID uint, paidAt time.Time) (*Subscription, error)
	GetByID(ctx context.Context, id uint) (*Subscription, error)
	GetByUserID(ctx context.Context, userID uint) ([]*Subscription, error)
	Cancel(ctx context.Context, id uint) error
	Revoke(ctx context.Context, id uint) error
}

type service struct {
	repo     Repository
	planRepo plan.Repository
	payment  payment.Provider
}

func NewService(repo Repository, planRepo plan.Repository, payment payment.Provider) Service {
	return &service{repo: repo, planRepo: planRepo, payment: payment}
}

func (s *service) Create(ctx context.Context, userID uint, tier plan.Tier, cycle plan.Cycle, startsAt time.Time) (*Subscription, error) {
	switch cycle {
	case plan.CycleMonthly, plan.CycleYearly, plan.CycleLifetime:
	default:
		return nil, fmt.Errorf("invalid billing cycle: %s", cycle)
	}

	p, err := s.planRepo.GetPlan(ctx, tier)
	if err != nil {
		return nil, fmt.Errorf("get plan: %w", err)
	}

	var expiresAt *time.Time
	switch cycle {
	case plan.CycleMonthly:
		t := startsAt.AddDate(0, 1, 0)
		expiresAt = &t
	case plan.CycleYearly:
		t := startsAt.AddDate(1, 0, 0)
		expiresAt = &t
	case plan.CycleLifetime:
		expiresAt = nil
	}

	// Snapshot modules/app_scope from the plan at creation time — later edits to
	// the plan (§6.5 admin CRUD) don't retroactively change already-issued subs.
	sub := &Subscription{
		UserID:     userID,
		Tier:       tier,
		Cycle:      cycle,
		ExtraSeats: 0,
		Status:     SubscriptionStatusActive,
		StartsAt:   startsAt,
		ExpiresAt:  expiresAt,
		Modules:    p.Modules,
		AppScope:   p.AppScope,
	}

	if err := s.repo.Create(ctx, sub); err != nil {
		return nil, fmt.Errorf("create subscription: %w", err)
	}

	return sub, nil
}

func (s *service) GetByID(ctx context.Context, id uint) (*Subscription, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *service) GetByUserID(ctx context.Context, userID uint) ([]*Subscription, error) {
	return s.repo.GetByUserID(ctx, userID)
}

func (s *service) Extend(ctx context.Context, subscriptionID uint, paidAt time.Time) (*Subscription, error) {
	sub, err := s.repo.GetByID(ctx, subscriptionID)
	if err != nil {
		return nil, fmt.Errorf("get subscription: %w", err)
	}

	if sub.Cycle == plan.CycleLifetime {
		return sub, nil
	}

	// Extend from current expiry, or from paidAt if already lapsed.
	base := paidAt
	if sub.ExpiresAt != nil && sub.ExpiresAt.After(paidAt) {
		base = *sub.ExpiresAt
	}

	var next time.Time
	switch sub.Cycle {
	case plan.CycleMonthly:
		next = base.AddDate(0, 1, 0)
	case plan.CycleYearly:
		next = base.AddDate(1, 0, 0)
	default:
		return nil, fmt.Errorf("unknown billing cycle: %s", sub.Cycle)
	}

	sub.ExpiresAt = &next
	sub.Status = SubscriptionStatusActive
	if err := s.repo.Update(ctx, sub); err != nil {
		return nil, fmt.Errorf("update subscription: %w", err)
	}

	return sub, nil
}

func (s *service) Cancel(ctx context.Context, id uint) error {
	sub, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("get subscription: %w", err)
	}
	sub.Status = SubscriptionStatusCancelled
	return s.repo.Update(ctx, sub)
}

func (s *service) Revoke(ctx context.Context, id uint) error {
	sub, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("get subscription: %w", err)
	}
	sub.Status = SubscriptionStatusRevoked
	return s.repo.Update(ctx, sub)
}
