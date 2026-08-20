package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/loqa/api/internal/plan"
	"github.com/spf13/cobra"
)

var planCmd = &cobra.Command{
	Use:   "plan",
	Short: "Manage plans and pricing",
}

var seedPlanCmd = &cobra.Command{
	Use:   "seed",
	Short: "Seed plans and pricing from configs/plans.json",
	RunE:  runPlanSeed,
}

var seedManifest string

func init() {
	seedPlanCmd.Flags().StringVar(&seedManifest, "file", "configs/plans.json", "path to plans JSON manifest")
	planCmd.AddCommand(seedPlanCmd)
}

type plansManifest struct {
	Plans []struct {
		Tier           plan.Tier `json:"tier"`
		IncludedSeats  int       `json:"included_seats"`
		ExtraSeatPrice float64   `json:"extra_seat_price"`
	} `json:"plans"`
	Pricing []struct {
		Tier  plan.Tier  `json:"tier"`
		Cycle plan.Cycle `json:"cycle"`
		Price float64    `json:"price"`
	} `json:"pricing"`
}

func runPlanSeed(cmd *cobra.Command, args []string) error {
	f, err := os.Open(seedManifest)
	if err != nil {
		return fmt.Errorf("open manifest: %w", err)
	}
	defer f.Close()

	var manifest plansManifest
	if err := json.NewDecoder(f).Decode(&manifest); err != nil {
		return fmt.Errorf("decode manifest: %w", err)
	}

	ctx := context.Background()
	repo := plan.NewRepository(gormDB)
	now := time.Now()

	for _, p := range manifest.Plans {
		entry := plan.Plan{Tier: p.Tier, IncludedSeats: p.IncludedSeats, ExtraSeatPrice: p.ExtraSeatPrice, CreatedAt: now, UpdatedAt: now}
		if err := repo.UpsertPlan(ctx, &entry); err != nil {
			return fmt.Errorf("upsert plan %s: %w", p.Tier, err)
		}
		fmt.Printf("plan %s: included_seats=%d extra_seat_price=%.0f\n", p.Tier, p.IncludedSeats, p.ExtraSeatPrice)
	}

	for _, p := range manifest.Pricing {
		entry := plan.Pricing{Tier: p.Tier, Cycle: p.Cycle, Price: p.Price, CreatedAt: now, UpdatedAt: now}
		if err := repo.UpsertPricing(ctx, &entry); err != nil {
			return fmt.Errorf("upsert pricing %s/%s: %w", p.Tier, p.Cycle, err)
		}
		fmt.Printf("pricing %s/%s: %.0f\n", p.Tier, p.Cycle, p.Price)
	}

	fmt.Println("seed complete")
	return nil
}
