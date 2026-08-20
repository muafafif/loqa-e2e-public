package license

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/loqa/api/internal/plan"
)

// ClaimsVersion 2 adds Modules/AppScope. Apps reading claims_version < 2 (or
// missing, i.e. zero value on an old cached JWT) know those fields are absent
// and should treat the license as module-less rather than crash — see
// license_service.py on the app side.
const ClaimsVersion = 2

type Claims struct {
	LicenseKey    string           `json:"license_key"`
	Tier          plan.Tier        `json:"tier"`
	ExpiresAt     *time.Time       `json:"expires_at"`
	Fingerprint   string           `json:"fingerprint"`
	Modules       plan.StringArray `json:"modules"`
	AppScope      plan.AppScope    `json:"app_scope"`
	ClaimsVersion int              `json:"claims_version"`
	jwt.RegisteredClaims
}

type Signer struct {
	privateKey *rsa.PrivateKey
	PublicKey  *rsa.PublicKey
}

func NewSigner(privateKeyPEM string) (*Signer, error) {
	// Support \n escaped newlines from env vars
	privateKeyPEM = strings.ReplaceAll(privateKeyPEM, `\n`, "\n")

	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	privKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}

	return &Signer{privateKey: privKey, PublicKey: &privKey.PublicKey}, nil
}

func (s *Signer) Sign(key string, tier plan.Tier, subExpiresAt *time.Time, fingerprint string, offlineDays int, modules plan.StringArray, appScope plan.AppScope) (string, error) {
	now := time.Now()
	jwtExp := now.Add(time.Duration(offlineDays) * 24 * time.Hour)

	claims := Claims{
		LicenseKey:    key,
		Tier:          tier,
		ExpiresAt:     subExpiresAt,
		Fingerprint:   fingerprint,
		Modules:       modules,
		AppScope:      appScope,
		ClaimsVersion: ClaimsVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(jwtExp),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(s.privateKey)
}

func (s *Signer) Verify(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.PublicKey, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid claims")
	}
	return claims, nil
}
