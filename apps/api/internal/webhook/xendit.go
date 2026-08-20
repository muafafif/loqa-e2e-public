package webhook

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/loqa/api/internal/plan"
)

type XenditInvoiceEvent struct {
	ID         string     `json:"id"`
	ExternalID string     `json:"external_id"`
	Status     string     `json:"status"`
	PaidAt     *time.Time `json:"paid_at"`
}

type XenditRecurringEvent struct {
	ID             string     `json:"id"`
	Event          string     `json:"event"`
	SubscriptionID uint       `json:"subscription_id"`
	PaidAt         *time.Time `json:"paid_at"`
}

// ExternalID format: loqa-sub-{userID}-{tier}-{cycle}
func (e *XenditInvoiceEvent) UserID() uint {
	parts := strings.Split(e.ExternalID, "-")
	if len(parts) < 5 {
		return 0
	}
	id, err := strconv.ParseUint(parts[2], 10, 64)
	if err != nil {
		return 0
	}
	return uint(id)
}

func (e *XenditInvoiceEvent) Tier() plan.Tier {
	parts := strings.Split(e.ExternalID, "-")
	if len(parts) < 5 {
		return ""
	}
	return plan.Tier(parts[3])
}

func (e *XenditInvoiceEvent) Cycle() plan.Cycle {
	parts := strings.Split(e.ExternalID, "-")
	if len(parts) < 5 {
		return ""
	}
	return plan.Cycle(strings.Join(parts[4:], "-"))
}

func ExternalID(userID uint, tier plan.Tier, cycle plan.Cycle) string {
	return fmt.Sprintf("loqa-sub-%d-%s-%s", userID, tier, cycle)
}
