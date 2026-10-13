package security

import (
	"bytes"
	"io"
	"testing"
)

func TestAES256GCMEncryptionRoundtrip(t *testing.T) {
	key := []byte("01234567890123456789012345678901") // 32 bytes
	plaintext := []byte("Sensitive SQL Backup Data: PostgreSQL 16 Dump contents")

	ciphertext, err := EncryptAESGCM(plaintext, key)
	if err != nil {
		t.Fatalf("EncryptAESGCM failed: %v", err)
	}

	if bytes.Equal(ciphertext, plaintext) {
		t.Fatalf("Ciphertext matches plaintext")
	}

	decrypted, err := DecryptAESGCM(ciphertext, key)
	if err != nil {
		t.Fatalf("DecryptAESGCM failed: %v", err)
	}

	if !bytes.Equal(decrypted, plaintext) {
		t.Errorf("Decrypted data does not match original plaintext")
	}

	// Test tampering detection
	tampered := make([]byte, len(ciphertext))
	copy(tampered, ciphertext)
	tampered[len(tampered)-1] ^= 0xFF

	_, err = DecryptAESGCM(tampered, key)
	if err == nil {
		t.Errorf("Expected DecryptAESGCM to fail on tampered ciphertext")
	}
}

func TestStreamingHasher(t *testing.T) {
	content := []byte("Data stream to be hashed with SHA-256")
	expectedHash := SHA256String(content)

	reader := bytes.NewReader(content)
	tee, getHash := NewStreamingHasher(reader)

	var buf bytes.Buffer
	n, err := io.Copy(&buf, tee)
	if err != nil {
		t.Fatalf("io.Copy failed: %v", err)
	}

	if n != int64(len(content)) {
		t.Fatalf("Expected %d bytes copied, got %d", len(content), n)
	}

	computedHash := getHash()
	if computedHash != expectedHash {
		t.Errorf("Expected hash %s, got %s", expectedHash, computedHash)
	}
}
