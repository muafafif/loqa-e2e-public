package auth

import "net/http"

type Identity struct {
	UserID uint
	Email  string
}

type Middleware interface {
	Authenticate(next http.Handler) http.Handler
	GetIdentity(r *http.Request) (*Identity, bool)
}
