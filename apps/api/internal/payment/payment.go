package payment

import (
	"context"
	"time"
)

type InvoiceRequest struct {
	ExternalID  string
	UserID      uint
	Cycle       string
	Amount      float64
	PayerEmail  string
	Description string
}

type InvoiceResponse struct {
	ID         string
	PaymentURL string
	ExpiresAt  time.Time
}

type Provider interface {
	CreateInvoice(ctx context.Context, req InvoiceRequest) (*InvoiceResponse, error)
}
