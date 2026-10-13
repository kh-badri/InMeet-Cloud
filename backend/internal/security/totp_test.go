package security

import (
	"strings"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
)

func TestTOTPGenerationAndValidation(t *testing.T) {
	setup, err := GenerateTOTP("admin@backupvault.local", "BackupVault")
	if err != nil {
		t.Fatalf("Failed to generate TOTP: %v", err)
	}

	if setup.Secret == "" {
		t.Fatalf("Expected non-empty TOTP secret")
	}

	if !strings.HasPrefix(setup.QRCodeURL, "data:image/png;base64,") {
		t.Errorf("Expected base64 PNG data URL, got: %s", setup.QRCodeURL[:30])
	}

	if len(setup.RecoveryCodes) != 10 {
		t.Errorf("Expected 10 recovery codes, got: %d", len(setup.RecoveryCodes))
	}

	// Generate a valid passcode for the secret
	passcode, err := totp.GenerateCode(setup.Secret, time.Now())
	if err != nil {
		t.Fatalf("Failed to generate passcode for test: %v", err)
	}

	if !ValidatePasscode(passcode, setup.Secret) {
		t.Errorf("ValidatePasscode failed for valid code %s", passcode)
	}

	// Test invalid passcode
	if ValidatePasscode("000000", setup.Secret) && passcode != "000000" {
		t.Errorf("ValidatePasscode should reject arbitrary passcode")
	}
}

func TestRecoveryCodes(t *testing.T) {
	codes, err := GenerateRecoveryCodes(5)
	if err != nil {
		t.Fatalf("Failed to generate recovery codes: %v", err)
	}

	if len(codes) != 5 {
		t.Fatalf("Expected 5 codes, got: %d", len(codes))
	}

	// Hash the codes for storage
	hashed := make([]string, len(codes))
	for i, c := range codes {
		hashed[i] = HashRecoveryCode(c)
	}

	// Test valid single-use consumption
	targetCode := codes[2]
	consumed, remaining := VerifyAndConsumeRecoveryCode(targetCode, hashed)
	if !consumed {
		t.Fatalf("Expected recovery code %s to be consumed", targetCode)
	}
	if len(remaining) != 4 {
		t.Errorf("Expected 4 remaining codes, got: %d", len(remaining))
	}

	// Try consuming the same code again (must fail)
	consumedAgain, _ := VerifyAndConsumeRecoveryCode(targetCode, remaining)
	if consumedAgain {
		t.Errorf("Recovery code must not be reusable")
	}

	// Test case and hyphen insensitivity
	cleanTarget := strings.ToLower(strings.ReplaceAll(codes[0], "-", ""))
	consumedClean, remaining2 := VerifyAndConsumeRecoveryCode(cleanTarget, remaining)
	if !consumedClean {
		t.Fatalf("Expected normalized recovery code to be consumed")
	}
	if len(remaining2) != 3 {
		t.Errorf("Expected 3 remaining codes, got: %d", len(remaining2))
	}
}
