package subscription_test

import (
	"context"
	"testing"
	"time"

	"github.com/loqa/api/internal/payment"
	"github.com/loqa/api/internal/plan"
	"github.com/loqa/api/internal/subscription"
	"github.com/stretchr/testify/assert"
)

type StubRepository struct{}

func (s *StubRepository) Create(ctx context.Context, sub *subscription.Subscription) error {
	return nil
}

func (s *StubRepository) GetByID(ctx context.Context, id uint) (*subscription.Subscription, error) {
	return &subscription.Subscription{}, nil
}

func (s *StubRepository) GetByUserID(ctx context.Context, userID uint) ([]*subscription.Subscription, error) {
	return nil, nil
}

func (s *StubRepository) Update(ctx context.Context, sub *subscription.Subscription) error {
	return nil
}

type StubPaymentProvider struct{}

func (s *StubPaymentProvider) CreateInvoice(ctx context.Context, req payment.InvoiceRequest) (*payment.InvoiceResponse, error) {
	return &payment.InvoiceResponse{
		ID:         "inv_stub",
		PaymentURL: "https://stub.payment/link",
		ExpiresAt:  time.Now().Add(24 * time.Hour),
	}, nil
}

type StubPlanRepository struct{}

func (s *StubPlanRepository) GetPricing(ctx context.Context, tier plan.Tier, cycle plan.Cycle) (*plan.Pricing, error) {
	return &plan.Pricing{Tier: tier, Cycle: cycle}, nil
}

func (s *StubPlanRepository) GetPlan(ctx context.Context, tier plan.Tier) (*plan.Plan, error) {
	return &plan.Plan{Tier: tier, IncludedSeats: 1, Modules: plan.StringArray{"chat", "finance"}, AppScope: plan.AppScopePersonal}, nil
}

func (s *StubPlanRepository) UpsertPlan(ctx context.Context, p *plan.Plan) error { return nil }

func (s *StubPlanRepository) UpsertPricing(ctx context.Context, p *plan.Pricing) error { return nil }

func newSvc() subscription.Service {
	return subscription.NewService(&StubRepository{}, &StubPlanRepository{}, &StubPaymentProvider{})
}

func TestCreate_Monthly(t *testing.T) {
	startsAt := time.Now()

	sub, err := newSvc().Create(context.Background(), 1, plan.TierStarter, plan.CycleMonthly, startsAt)

	assert.NoError(t, err)
	assert.Equal(t, plan.CycleMonthly, sub.Cycle)
	assert.Equal(t, plan.TierStarter, sub.Tier)
	assert.Equal(t, subscription.SubscriptionStatusActive, sub.Status)
	assert.NotNil(t, sub.ExpiresAt)
	assert.WithinDuration(t, startsAt.AddDate(0, 1, 0), *sub.ExpiresAt, time.Second)
}

func TestCreate_Yearly(t *testing.T) {
	startsAt := time.Now()

	sub, err := newSvc().Create(context.Background(), 1, plan.TierStarter, plan.CycleYearly, startsAt)

	assert.NoError(t, err)
	assert.NotNil(t, sub.ExpiresAt)
	assert.WithinDuration(t, startsAt.AddDate(1, 0, 0), *sub.ExpiresAt, time.Second)
}

func TestCreate_Lifetime(t *testing.T) {
	sub, err := newSvc().Create(context.Background(), 1, plan.TierStarter, plan.CycleLifetime, time.Now())

	assert.NoError(t, err)
	assert.Nil(t, sub.ExpiresAt)
}

func TestCreate_InvalidCycle(t *testing.T) {
	_, err := newSvc().Create(context.Background(), 1, plan.TierStarter, "invalid", time.Now())

	assert.Error(t, err)
}

func TestCancel(t *testing.T) {
	t.Skip("not implemented")
}

func TestRevoke(t *testing.T) {
	t.Skip("not implemented")
}
