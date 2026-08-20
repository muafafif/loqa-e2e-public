package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const identityKey contextKey = "identity"

type jwtMiddleware struct {
	secret []byte
}

func NewJWT(secret string) Middleware {
	return &jwtMiddleware{secret: []byte(secret)}
}

func (m *jwtMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		claims, err := m.parse(token)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), identityKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *jwtMiddleware) GetIdentity(r *http.Request) (*Identity, bool) {
	claims, ok := r.Context().Value(identityKey).(*Identity)
	return claims, ok
}

func (m *jwtMiddleware) parse(tokenStr string) (*Identity, error) {
	type jwtClaims struct {
		UserID uint   `json:"user_id"`
		Email  string `json:"email"`
		jwt.RegisteredClaims
	}

	token, err := jwt.ParseWithClaims(tokenStr, &jwtClaims{}, func(t *jwt.Token) (interface{}, error) {
		return m.secret, nil
	})
	if err != nil || !token.Valid {
		return nil, err
	}

	c := token.Claims.(*jwtClaims)
	return &Identity{UserID: c.UserID, Email: c.Email}, nil
}

func (m *jwtMiddleware) Issue(userID uint, email string, ttl time.Duration) (string, error) {
	type jwtClaims struct {
		UserID uint   `json:"user_id"`
		Email  string `json:"email"`
		jwt.RegisteredClaims
	}

	claims := jwtClaims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}
