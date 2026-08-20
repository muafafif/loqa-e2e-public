package db

import (
	"github.com/loqa/api/internal/device"
	"github.com/loqa/api/internal/license"
	"github.com/loqa/api/internal/plan"
	"github.com/loqa/api/internal/subscription"
	"github.com/loqa/api/internal/user"
	"github.com/loqa/api/internal/webhook"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true,
	}), &gorm.Config{})
	if err != nil {
		return nil, err
	}
	return db, nil
}

func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&user.User{},
		&plan.Plan{},
		&plan.Pricing{},
		&subscription.Subscription{},
		&license.LicenseKey{},
		&device.Activation{},
		&webhook.ProcessedEvent{},
	)
}
