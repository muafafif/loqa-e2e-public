package license

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/loqa/api/internal/device"
)

type Handler struct {
	licenseSvc Service
}

func NewHandler(licenseSvc Service) *Handler {
	return &Handler{licenseSvc: licenseSvc}
}

type activateRequest struct {
	Key         string `json:"key"`
	Fingerprint string `json:"fingerprint"`
}

type activateResponse struct {
	Token string `json:"token"`
}

func (h *Handler) Validate(w http.ResponseWriter, r *http.Request) {
	tokenStr := r.Header.Get("Authorization")
	if len(tokenStr) > 7 && tokenStr[:7] == "Bearer " {
		tokenStr = tokenStr[7:]
	}
	if tokenStr == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	fresh, err := h.licenseSvc.Validate(r.Context(), tokenStr)
	if err != nil {
		if errors.Is(err, ErrDeviceRevoked) {
			http.Error(w, "license revoked", http.StatusForbidden)
			return
		}
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(activateResponse{Token: fresh})
}

func (h *Handler) RevokeDevice(w http.ResponseWriter, r *http.Request) {
	subscriptionID := chi.URLParam(r, "id")
	fingerprint := chi.URLParam(r, "fingerprint")
	if subscriptionID == "" || fingerprint == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	var subID uint
	if _, err := fmt.Sscanf(subscriptionID, "%d", &subID); err != nil {
		http.Error(w, "invalid subscription id", http.StatusBadRequest)
		return
	}

	if err := h.licenseSvc.RevokeDevice(r.Context(), subID, fingerprint); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Activate(w http.ResponseWriter, r *http.Request) {
	var req activateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Key == "" || req.Fingerprint == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	token, err := h.licenseSvc.Activate(r.Context(), req.Key, req.Fingerprint)
	if err != nil {
		if errors.Is(err, device.ErrSeatLimitReached) {
			http.Error(w, "seat limit reached", http.StatusForbidden)
			return
		}
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(activateResponse{Token: token})
}
