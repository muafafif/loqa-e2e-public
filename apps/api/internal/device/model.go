package device

import (
	"errors"
	"time"
)

var ErrSeatLimitReached = errors.New("seat limit reached")

type Status string

const (
	StatusActive        Status = "active"
	StatusRevokePending Status = "revoke_pending"
	StatusDeactivated   Status = "deactivated"
)

type Activation struct {
	ID           uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	LicenseKeyID uint      `json:"license_key_id" gorm:"not null;index"`
	Fingerprint  string    `json:"fingerprint" gorm:"not null;index"`
	Status       Status    `json:"status" gorm:"not null;default:'active'"`
	ActivatedAt  time.Time `json:"activated_at" gorm:"not null"`
	LastSeenAt   time.Time `json:"last_seen_at" gorm:"not null"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
