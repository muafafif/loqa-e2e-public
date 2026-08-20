package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"

	"github.com/spf13/cobra"
)

var keyCmd = &cobra.Command{
	Use:   "key",
	Short: "Manage cryptographic keys",
}

var genRSACmd = &cobra.Command{
	Use:   "gen-rsa",
	Short: "Generate RSA key pair for license JWT signing",
	RunE:  runGenRSA,
}

func init() {
	keyCmd.AddCommand(genRSACmd)
}

func runGenRSA(cmd *cobra.Command, args []string) error {
	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("generate key: %w", err)
	}

	privPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privKey),
	})

	pubPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PUBLIC KEY",
		Bytes: x509.MarshalPKCS1PublicKey(&privKey.PublicKey),
	})

	fmt.Println("# Add to .env:")
	fmt.Printf("LICENSE_PRIVATE_KEY=\"%s\"\n\n", singleLine(privPEM))
	fmt.Println("# Embed in app binary (public key):")
	fmt.Printf("%s\n", pubPEM)
	return nil
}

func singleLine(pem []byte) string {
	var result []byte
	for _, b := range pem {
		if b == '\n' {
			result = append(result, '\\', 'n')
		} else {
			result = append(result, b)
		}
	}
	return string(result)
}
