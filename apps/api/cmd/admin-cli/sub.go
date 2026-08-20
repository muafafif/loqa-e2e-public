package main

import (
	"context"
	"fmt"

	"github.com/loqa/api/internal/payment"
	"github.com/loqa/api/internal/plan"
	"github.com/loqa/api/internal/webhook"
	"github.com/spf13/cobra"
)

var subCmd = &cobra.Command{
	Use:   "sub",
	Short: "Manage subscriptions",
}

var createInvoiceCmd = &cobra.Command{
	Use:   "create-invoice",
	Short: "Create a payment invoice for a user",
	RunE:  runSubCreateInvoice,
}

var listSubCmd = &cobra.Command{
	Use:   "list",
	Short: "List subscriptions",
	RunE:  runSubList,
}

var revokeSubCmd = &cobra.Command{
	Use:   "revoke",
	Short: "Revoke a subscription",
	RunE:  runSubRevoke,
}

var (
	createInvoiceUserID uint
	createInvoiceTier   string
	createInvoiceCycle  string
	createInvoiceEmail  string
	listSubUserID       uint
	revokeSubID         uint
)

func init() {
	createInvoiceCmd.Flags().UintVar(&createInvoiceUserID, "user-id", 0, "user ID (required)")
	createInvoiceCmd.Flags().StringVar(&createInvoiceTier, "tier", "", "plan tier: starter | pro | business (required)")
	createInvoiceCmd.Flags().StringVar(&createInvoiceCycle, "cycle", "", "billing cycle: monthly | yearly | lifetime (required)")
	createInvoiceCmd.Flags().StringVar(&createInvoiceEmail, "email", "", "payer email (required)")
	createInvoiceCmd.MarkFlagRequired("user-id")
	createInvoiceCmd.MarkFlagRequired("tier")
	createInvoiceCmd.MarkFlagRequired("cycle")
	createInvoiceCmd.MarkFlagRequired("email")

	listSubCmd.Flags().UintVar(&listSubUserID, "user-id", 0, "filter by user ID")

	revokeSubCmd.Flags().UintVar(&revokeSubID, "id", 0, "subscription ID (required)")
	revokeSubCmd.MarkFlagRequired("id")

	subCmd.AddCommand(createInvoiceCmd, listSubCmd, revokeSubCmd)
}

func runSubCreateInvoice(cmd *cobra.Command, args []string) error {
	tier := plan.Tier(createInvoiceTier)
	cycle := plan.Cycle(createInvoiceCycle)

	pricing, err := plan.NewRepository(gormDB).GetPricing(context.Background(), tier, cycle)
	if err != nil {
		return fmt.Errorf("get pricing: %w", err)
	}

	externalID := webhook.ExternalID(createInvoiceUserID, tier, cycle)

	resp, err := paymentProvider.CreateInvoice(context.Background(), payment.InvoiceRequest{
		ExternalID:  externalID,
		UserID:      createInvoiceUserID,
		Cycle:       string(cycle),
		Amount:      pricing.Price,
		PayerEmail:  createInvoiceEmail,
		Description: fmt.Sprintf("LOQA subscription — %s %s", createInvoiceTier, createInvoiceCycle),
	})
	if err != nil {
		return fmt.Errorf("create invoice: %w", err)
	}

	fmt.Printf("Invoice created.\nPayment URL: %s\n", resp.PaymentURL)
	return nil
}

func runSubList(cmd *cobra.Command, args []string) error {
	fmt.Println("not implemented")
	return nil
}

func runSubRevoke(cmd *cobra.Command, args []string) error {
	fmt.Println("not implemented")
	return nil
}
