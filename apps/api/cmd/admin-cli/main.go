package main

import (
	"fmt"
	"os"

	"github.com/loqa/api/internal/config"
	"github.com/loqa/api/internal/db"
	"github.com/loqa/api/internal/payment"
	"github.com/loqa/api/internal/xendit"
	"github.com/spf13/cobra"
	"gorm.io/gorm"
)

var (
	cfg             *config.Config
	paymentProvider payment.Provider
	gormDB          *gorm.DB
)

var rootCmd = &cobra.Command{
	Use:   "admin",
	Short: "LOQA admin CLI",
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		cfg = config.Load()
		paymentProvider = xendit.NewClient(cfg.XenditAPIKey)

		var err error
		gormDB, err = db.Connect(cfg.DatabaseURL)
		if err != nil {
			return fmt.Errorf("db connect: %w", err)
		}
		return nil
	},
}

func main() {
	rootCmd.AddCommand(subCmd, planCmd, keyCmd)

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
