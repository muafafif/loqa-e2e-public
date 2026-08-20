package main

import (
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/loqa/api/internal/auth"
	"github.com/loqa/api/internal/config"
	"github.com/loqa/api/internal/db"
	"github.com/loqa/api/internal/device"
	"github.com/loqa/api/internal/license"
	"github.com/loqa/api/internal/plan"
	subhandler "github.com/loqa/api/internal/subscription"
	"github.com/loqa/api/internal/webhook"
	"github.com/loqa/api/internal/xendit"
)

func main() {
	cfg := config.Load()

	gormDB, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}

	if err := db.Migrate(gormDB); err != nil {
		log.Fatalf("db migrate: %v", err)
	}

	if err := db.BackfillModuleDefaults(gormDB); err != nil {
		log.Fatalf("db backfill module defaults: %v", err)
	}

	signer, err := license.NewSigner(cfg.LicensePrivateKey)
	if err != nil {
		log.Fatalf("license signer: %v", err)
	}

	authMW := auth.NewJWT(cfg.JWTSecret)
	paymentProvider := xendit.NewClient(cfg.XenditAPIKey)

	planRepo := plan.NewRepository(gormDB)

	subRepo := subhandler.NewRepository(gormDB)
	subSvc := subhandler.NewService(subRepo, planRepo, paymentProvider)
	subHandler := subhandler.NewHandler(subSvc, authMW)

	deviceRepo := device.NewRepository(gormDB)

	licenseRepo := license.NewRepository(gormDB)
	licenseSvc := license.NewService(licenseRepo, subRepo, planRepo, deviceRepo, signer, cfg.LicenseOfflineDays)
	licenseHandler := license.NewHandler(licenseSvc)

	idempotencyStore := webhook.NewIdempotencyStore(gormDB)
	webhookHandler := webhook.NewHandler(cfg.XenditWebhookSecret, subSvc, licenseSvc, idempotencyStore)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Post("/activate", licenseHandler.Activate)
	r.Post("/validate", licenseHandler.Validate)

	r.Route("/api/subscriptions", func(r chi.Router) {
		r.Use(authMW.Authenticate)
		r.Post("/", subHandler.Create)
		r.Get("/", subHandler.GetByUserID)
		r.Get("/{id}", subHandler.GetByID)
		r.Post("/{id}/cancel", subHandler.Cancel)
		r.Post("/{id}/revoke", subHandler.Revoke)
		r.Post("/{id}/devices/{fingerprint}/revoke", licenseHandler.RevokeDevice)
	})

	r.Post("/webhooks/xendit/invoice", webhookHandler.HandleFirstPayment)
	r.Post("/webhooks/xendit/recurring", webhookHandler.HandleXenditRecurring)

	log.Printf("server running on :%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, r))
}
