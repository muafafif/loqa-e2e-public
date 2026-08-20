package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL            string
	JWTSecret              string
	Port                   string
	XenditAPIKey           string
	XenditWebhookSecret    string
	LicensePrivateKey      string
	LicenseOfflineDays     int
}

func Load() *Config {
	_ = godotenv.Load()
	return &Config{
		DatabaseURL:         getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/loqa_api?sslmode=disable"),
		JWTSecret:           getEnv("JWT_SECRET", "change-me-in-production"),
		Port:                getEnv("PORT", "8080"),
		XenditAPIKey:        getEnv("XENDIT_API_KEY", ""),
		XenditWebhookSecret: getEnv("XENDIT_WEBHOOK_SECRET", ""),
		LicensePrivateKey:   getEnv("LICENSE_PRIVATE_KEY", ""),
		LicenseOfflineDays:  getEnvInt("LICENSE_OFFLINE_DAYS", 30),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
