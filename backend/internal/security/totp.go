package security

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"image/png"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

type TOTPSetup struct {
	Secret        string   `json:"secret"`
	QRCodeURL     string   `json:"qr_code_url"`
	RecoveryCodes []string `json:"recovery_codes"`
}

// GenerateTOTP generates a new TOTP key and recovery codes
func GenerateTOTP(accountName, issuer string) (*TOTPSetup, error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: accountName,
		Algorithm:   otp.AlgorithmSHA1,
		Digits:      otp.DigitsSix,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate TOTP key: %w", err)
	}

	// Generate QR Code image
	img, err := key.Image(200, 200)
	if err != nil {
		return nil, fmt.Errorf("failed to generate QR code image: %w", err)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("failed to encode QR code PNG: %w", err)
	}

	qrDataURL := fmt.Sprintf("data:image/png;base64,%s", base64.StdEncoding.EncodeToString(buf.Bytes()))

	// Generate 10 recovery codes
	recoveryCodes, err := GenerateRecoveryCodes(10)
	if err != nil {
		return nil, fmt.Errorf("failed to generate recovery codes: %w", err)
	}

	return &TOTPSetup{
		Secret:        key.Secret(),
		QRCodeURL:     qrDataURL,
		RecoveryCodes: recoveryCodes,
	}, nil
}

// ValidatePasscode checks if the given 6-digit passcode matches the secret
func ValidatePasscode(passcode, secret string) bool {
	return totp.Validate(passcode, secret)
}

// GenerateRecoveryCodes produces N secure human-readable recovery codes (e.g. 8492-4912)
func GenerateRecoveryCodes(count int) ([]string, error) {
	codes := make([]string, count)
	for i := 0; i < count; i++ {
		b := make([]byte, 5)
		if _, err := rand.Read(b); err != nil {
			return nil, err
		}
		hexStr := hex.EncodeToString(b)
		codes[i] = fmt.Sprintf("%s-%s", stringsToUpper(hexStr[:5]), stringsToUpper(hexStr[5:]))
	}
	return codes, nil
}

// HashRecoveryCode hashes a recovery code with SHA-256 for safe database storage
func HashRecoveryCode(code string) string {
	cleaned := cleanCode(code)
	h := sha256.Sum256([]byte(cleaned))
	return hex.EncodeToString(h[:])
}

// VerifyAndConsumeRecoveryCode checks if rawCode matches any hashed code in list, and removes it
func VerifyAndConsumeRecoveryCode(rawCode string, hashedCodes []string) (bool, []string) {
	targetHash := HashRecoveryCode(rawCode)
	for i, h := range hashedCodes {
		if h == targetHash {
			// Remove the used code
			remaining := append(hashedCodes[:i], hashedCodes[i+1:]...)
			return true, remaining
		}
	}
	return false, hashedCodes
}

func stringsToUpper(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'a' && b[i] <= 'z' {
			b[i] -= 32
		}
	}
	return string(b)
}

func cleanCode(s string) string {
	var out []rune
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			if r >= 'a' && r <= 'z' {
				r -= 32
			}
			out = append(out, r)
		}
	}
	return string(out)
}
