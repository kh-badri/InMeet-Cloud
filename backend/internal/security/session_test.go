package security

import (
	"testing"
)

func TestSessionAndCSRFGeneration(t *testing.T) {
	sessID, err := GenerateSessionID()
	if err != nil {
		t.Fatalf("GenerateSessionID failed: %v", err)
	}

	if len(sessID) != 64 { // 32 bytes in hex = 64 characters
		t.Errorf("Expected 64 hex chars, got: %d", len(sessID))
	}

	csrfToken, err := GenerateCSRFToken()
	if err != nil {
		t.Fatalf("GenerateCSRFToken failed: %v", err)
	}

	if len(csrfToken) != 64 {
		t.Errorf("Expected 64 hex chars for CSRF token, got: %d", len(csrfToken))
	}

	// Validate CSRF constant-time comparison
	if !ValidateCSRF(csrfToken, csrfToken) {
		t.Errorf("ValidateCSRF should accept identical token")
	}

	if ValidateCSRF(csrfToken, "altered-token-value") {
		t.Errorf("ValidateCSRF should reject non-matching token")
	}

	if ValidateCSRF("", "") {
		t.Errorf("ValidateCSRF should reject empty tokens")
	}
}
