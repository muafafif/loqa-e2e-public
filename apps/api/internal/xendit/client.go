package xendit

import (
	"context"
	"fmt"

	"github.com/loqa/api/internal/payment"
	xnd "github.com/xendit/xendit-go/v6"
	"github.com/xendit/xendit-go/v6/invoice"
)

type Client struct {
	api *xnd.APIClient
}

func NewClient(apiKey string) payment.Provider {
	return &Client{
		api: xnd.NewClient(apiKey),
	}
}

func (c *Client) CreateInvoice(ctx context.Context, req payment.InvoiceRequest) (*payment.InvoiceResponse, error) {
	shouldSendEmail := true
	params := invoice.CreateInvoiceRequest{
		ExternalId:     req.ExternalID,
		Amount:         req.Amount,
		PayerEmail:     &req.PayerEmail,
		Description:    &req.Description,
		ShouldSendEmail: &shouldSendEmail,
	}

	resp, _, err := c.api.InvoiceApi.CreateInvoice(ctx).CreateInvoiceRequest(params).Execute()
	if err != nil {
		return nil, fmt.Errorf("xendit create invoice: %w", err)
	}

	return &payment.InvoiceResponse{
		ID:         resp.GetId(),
		PaymentURL: resp.GetInvoiceUrl(),
		ExpiresAt:  resp.GetExpiryDate(),
	}, nil
}
