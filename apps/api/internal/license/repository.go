package license

import (
	"context"
	"fmt"

	"gorm.io/gorm"
)

type Repository interface {
	Create(ctx context.Context, lk *LicenseKey) error
	GetBySubscriptionID(ctx context.Context, subscriptionID uint) (*LicenseKey, error)
	GetByKey(ctx context.Context, key string) (*LicenseKey, error)
	Update(ctx context.Context, lk *LicenseKey) error
}

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db}
}

func (r *repository) Create(ctx context.Context, lk *LicenseKey) error {
	return r.db.WithContext(ctx).Create(lk).Error
}

func (r *repository) GetBySubscriptionID(ctx context.Context, subscriptionID uint) (*LicenseKey, error) {
	var lk LicenseKey
	if err := r.db.WithContext(ctx).Where("subscription_id = ?", subscriptionID).First(&lk).Error; err != nil {
		return nil, fmt.Errorf("license key not found for subscription %d: %w", subscriptionID, err)
	}
	return &lk, nil
}

func (r *repository) GetByKey(ctx context.Context, key string) (*LicenseKey, error) {
	var lk LicenseKey
	if err := r.db.WithContext(ctx).Where("key = ?", key).First(&lk).Error; err != nil {
		return nil, fmt.Errorf("license key not found: %w", err)
	}
	return &lk, nil
}

func (r *repository) Update(ctx context.Context, lk *LicenseKey) error {
	return r.db.WithContext(ctx).Save(lk).Error
}
