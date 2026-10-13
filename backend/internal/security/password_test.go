package security

import (
	"strings"
	"testing"
)

func TestArgon2idPasswordHashing(t *testing.T) {
	password := "SecretPassword123!@#"

	// Fast params for test execution speed
	testParams := &Argon2Params{
		Memory:      16 * 1024, // 16 MB
		Iterations:  1,
		Parallelism: 1,
		SaltLength:  16,
		KeyLength:   32,
	}

	hash, err := HashPasswordWithParams(password, testParams)
	if err != nil {
		t.Fatalf("Failed to hash password: %v", err)
	}

	if !strings.HasPrefix(hash, "$argon2id$v=") {
		t.Errorf("Expected argon2id prefix, got: %s", hash)
	}

	// Verify with correct password
	match, err := ComparePassword(password, hash)
	if err != nil {
		t.Fatalf("ComparePassword failed: %v", err)
	}
	if !match {
		t.Errorf("Expected password to match")
	}

	// Verify with wrong password
	wrongMatch, err := ComparePassword("WrongPassword123!", hash)
	if err != nil {
		t.Fatalf("ComparePassword with wrong password failed: %v", err)
	}
	if wrongMatch {
		t.Errorf("Expected wrong password to NOT match")
	}
}
