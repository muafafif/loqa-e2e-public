package subscription

import (
	"net/http"

	"github.com/loqa/api/internal/auth"
)

type Handler struct {
	svc  Service
	auth auth.Middleware
}

func NewHandler(svc Service, authMW auth.Middleware) *Handler {
	return &Handler{svc: svc, auth: authMW}
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request)         {}
func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request)        {}
func (h *Handler) GetByUserID(w http.ResponseWriter, r *http.Request)    {}
func (h *Handler) Cancel(w http.ResponseWriter, r *http.Request)         {}
func (h *Handler) Revoke(w http.ResponseWriter, r *http.Request)         {}
