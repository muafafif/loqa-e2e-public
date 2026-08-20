package device

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

type Repository interface {
	Create(ctx context.Context, a *Activation) error
	GetByFingerprint(ctx context.Context, licenseKeyID uint, fingerprint string) (*Activation, error)
	CountActive(ctx context.Context, licenseKeyID uint) (int64, error)
	Update(ctx context.Context, a *Activation) error
	// ActivateWithSeatCheck atomically re-activates an existing device (by
	// fingerprint) or creates a new activation if under the seat limit.
	// Concurrent calls for the same licenseKeyID are serialized via a
	// Postgres advisory lock, so two simultaneous activations can never both
	// pass the seat count check and exceed maxSeats.
	ActivateWithSeatCheck(ctx context.Context, licenseKeyID uint, fingerprint string, maxSeats int) (*Activation, error)
}

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db}
}

func (r *repository) Create(ctx context.Context, a *Activation) error {
	return r.db.WithContext(ctx).Create(a).Error
}

func (r *repository) GetByFingerprint(ctx context.Context, licenseKeyID uint, fingerprint string) (*Activation, error) {
	var a Activation
	err := r.db.WithContext(ctx).
		Where("license_key_id = ? AND fingerprint = ?", licenseKeyID, fingerprint).
		First(&a).Error
	if err != nil {
		return nil, fmt.Errorf("activation not found: %w", err)
	}
	return &a, nil
}

func (r *repository) CountActive(ctx context.Context, licenseKeyID uint) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&Activation{}).
		Where("license_key_id = ? AND status = ?", licenseKeyID, StatusActive).
		Count(&count).Error
	return count, err
}

func (r *repository) Update(ctx context.Context, a *Activation) error {
	return r.db.WithContext(ctx).Save(a).Error
}

func (r *repository) ActivateWithSeatCheck(ctx context.Context, licenseKeyID uint, fingerprint string, maxSeats int) (*Activation, error) {
	var result *Activation

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Serialize concurrent activation attempts for this license key so the
		// count-then-insert below can't race across two transactions. The lock
		// is held for the lifetime of this transaction and auto-released on
		// commit/rollback (pg_advisory_xact_lock).
		if err := tx.Exec("SELECT pg_advisory_xact_lock(?)", int64(licenseKeyID)).Error; err != nil {
			return fmt.Errorf("acquire activation lock: %w", err)
		}

		var existing Activation
		err := tx.Where("license_key_id = ? AND fingerprint = ?", licenseKeyID, fingerprint).First(&existing).Error
		if err == nil {
			// Re-activation: same fingerprint seen before → mark active, no new seat consumed.
			existing.Status = StatusActive
			existing.LastSeenAt = time.Now()
			if err := tx.Save(&existing).Error; err != nil {
				return fmt.Errorf("reactivate device: %w", err)
			}
			result = &existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("check existing activation: %w", err)
		}

		var count int64
		if err := tx.Model(&Activation{}).
			Where("license_key_id = ? AND status = ?", licenseKeyID, StatusActive).
			Count(&count).Error; err != nil {
			return fmt.Errorf("count active devices: %w", err)
		}
		if int(count) >= maxSeats {
			return ErrSeatLimitReached
		}

		now := time.Now()
		a := &Activation{
			LicenseKeyID: licenseKeyID,
			Fingerprint:  fingerprint,
			Status:       StatusActive,
			ActivatedAt:  now,
			LastSeenAt:   now,
		}
		if err := tx.Create(a).Error; err != nil {
			return fmt.Errorf("create activation: %w", err)
		}
		result = a
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
