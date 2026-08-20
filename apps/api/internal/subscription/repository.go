package subscription

import (
	"context"

	"gorm.io/gorm"
)

type Repository interface {
	Create(ctx context.Context, sub *Subscription) error
	GetByID(ctx context.Context, id uint) (*Subscription, error)
	GetByUserID(ctx context.Context, userID uint) ([]*Subscription, error)
	Update(ctx context.Context, sub *Subscription) error
}

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db}
}

func (r *repository) Create(ctx context.Context, sub *Subscription) error {
	return r.db.WithContext(ctx).Create(sub).Error
}

func (r *repository) GetByID(ctx context.Context, id uint) (*Subscription, error) {
	var sub Subscription
	if err := r.db.WithContext(ctx).First(&sub, id).Error; err != nil {
		return nil, err
	}
	return &sub, nil
}

func (r *repository) GetByUserID(ctx context.Context, userID uint) ([]*Subscription, error) {
	var subs []*Subscription
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&subs).Error; err != nil {
		return nil, err
	}
	return subs, nil
}

func (r *repository) Update(ctx context.Context, sub *Subscription) error {
	return r.db.WithContext(ctx).Save(sub).Error
}
