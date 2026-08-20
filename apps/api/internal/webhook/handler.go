package webhook

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/loqa/api/internal/license"
	"github.com/loqa/api/internal/subscription"
)

type Handler struct {
	webhookSecret string
	subSvc        subscription.Service
	licenseSvc    license.Service
	idempotency   IdempotencyStore
}

func NewHandler(webhookSecret string, subSvc subscription.Service, licenseSvc license.Service, idempotency IdempotencyStore) *Handler {
	return &Handler{
		webhookSecret: webhookSecret,
		subSvc:        subSvc,
		licenseSvc:    licenseSvc,
		idempotency:   idempotency,
	}
}

func (h *Handler) HandleXenditRecurring(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("x-callback-token") != h.webhookSecret {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var event XenditRecurringEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	if event.Event != "recurring.cycle.succeeded" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if event.SubscriptionID == 0 {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	// Xendit retries on timeout/non-2xx and can redeliver the same event —
	// without this, a retry would extend the subscription twice.
	if event.ID != "" {
		already, err := h.idempotency.MarkProcessed(r.Context(), "recurring", event.ID)
		if err != nil {
			log.Printf("webhook: recurring idempotency check error: %v", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if already {
			log.Printf("webhook: duplicate recurring event id=%s, skipping", event.ID)
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	paidAt := time.Now()
	if event.PaidAt != nil {
		paidAt = *event.PaidAt
	}

	if _, err := h.subSvc.Extend(r.Context(), event.SubscriptionID, paidAt); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) HandleFirstPayment(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("x-callback-token") != h.webhookSecret {
		log.Printf("webhook: invalid token")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var event XenditInvoiceEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		log.Printf("webhook: decode error: %v", err)
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	log.Printf("webhook: invoice event status=%s external_id=%s", event.Status, event.ExternalID)

	if event.Status != "PAID" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Xendit retries on timeout/non-2xx and can redeliver the same event —
	// without this, a retry would create a duplicate subscription + license key.
	if event.ID != "" {
		already, err := h.idempotency.MarkProcessed(r.Context(), "invoice", event.ID)
		if err != nil {
			log.Printf("webhook: invoice idempotency check error: %v", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if already {
			log.Printf("webhook: duplicate invoice event id=%s, skipping", event.ID)
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	userID := event.UserID()
	tier := event.Tier()
	cycle := event.Cycle()

	log.Printf("webhook: user_id=%d tier=%s cycle=%s", userID, tier, cycle)

	if userID == 0 || tier == "" || cycle == "" {
		log.Printf("webhook: invalid external_id user_id=%d tier=%s cycle=%s", userID, tier, cycle)
		http.Error(w, "invalid external_id", http.StatusBadRequest)
		return
	}

	startsAt := time.Now()
	if event.PaidAt != nil {
		startsAt = *event.PaidAt
	}

	sub, err := h.subSvc.Create(r.Context(), userID, tier, cycle, startsAt)
	if err != nil {
		log.Printf("webhook: create subscription error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if _, err := h.licenseSvc.Generate(r.Context(), sub.ID); err != nil {
		log.Printf("webhook: generate license error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	log.Printf("webhook: license generated for subscription %d", sub.ID)
	w.WriteHeader(http.StatusOK)
}
