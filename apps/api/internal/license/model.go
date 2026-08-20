package license

import (
	"errors"
	"time"
)

var ErrDeviceRevoked = errors.New("device revoked")

type Status string

const (
	StatusActive  Status = "active"
	StatusRevoked Status = "revoked"
)

type LicenseKey struct {
	ID             uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Key            string    `json:"key" gorm:"uniqueIndex;not null"`
	SubscriptionID uint      `json:"subscription_id" gorm:"not null;index"`
	Status         Status    `json:"status" gorm:"not null;default:'active'"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
