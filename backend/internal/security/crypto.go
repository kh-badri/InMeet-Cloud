package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

var (
	ErrInvalidCiphertext = errors.New("invalid ciphertext")
)

// EncryptAESGCM encrypts plaintext bytes using AES-256-GCM with a random 12-byte nonce
func EncryptAESGCM(plaintext, key []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("AES-256 requires 32-byte key, got %d bytes", len(key))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// DecryptAESGCM decrypts ciphertext bytes using AES-256-GCM
func DecryptAESGCM(ciphertext, key []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("AES-256 requires 32-byte key, got %d bytes", len(key))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, ErrInvalidCiphertext
	}

	nonce, actualCiphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, actualCiphertext, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}

// SHA256String computes SHA-256 hex string of a byte slice
func SHA256String(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

// StreamHasher wraps an io.Reader and calculates SHA-256 while streaming
type StreamHasher struct {
	reader io.Reader
	hasher hashWriter
}

type hashWriter struct {
	hash [32]byte
}

// NewStreamingHasher returns a TeeReader that writes to a sha256 hasher while reading
func NewStreamingHasher(r io.Reader) (io.Reader, func() string) {
	h := sha256.New()
	tee := io.TeeReader(r, h)
	return tee, func() string {
		return hex.EncodeToString(h.Sum(nil))
	}
}

// GenerateRandomHex generates cryptographically secure random hex string of N bytes
func GenerateRandomHex(bytesCount int) (string, error) {
	b := make([]byte, bytesCount)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
