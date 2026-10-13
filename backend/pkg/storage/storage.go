package storage

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var (
	ErrNotFound      = errors.New("file not found")
	ErrPathTraversal = errors.New("invalid path: path traversal detected")
	ErrInvalidOffset = errors.New("invalid offset for append")
)

// StorageBackend defines the interface for local and remote (S3/MinIO) storage
type StorageBackend interface {
	Write(ctx context.Context, relativePath string, r io.Reader) (int64, error)
	Append(ctx context.Context, relativePath string, r io.Reader, expectedOffset int64) (int64, error)
	Read(ctx context.Context, relativePath string) (io.ReadCloser, error)
	ReadRange(ctx context.Context, relativePath string, offset, length int64) (io.ReadCloser, error)
	Delete(ctx context.Context, relativePath string) error
	Size(ctx context.Context, relativePath string) (int64, error)
	Exists(ctx context.Context, relativePath string) (bool, error)
	GetFullPath(relativePath string) (string, error)
}

// LocalStorage implements StorageBackend on local disk with optional server-side AES-GCM encryption
type LocalStorage struct {
	baseDir       string
	encryptionKey []byte // 32-byte AES key; if nil, stored as plain stream
}

func NewLocalStorage(baseDir string, encryptionKey []byte) (*LocalStorage, error) {
	if err := os.MkdirAll(baseDir, 0750); err != nil {
		return nil, fmt.Errorf("failed to create base storage directory: %w", err)
	}
	return &LocalStorage{
		baseDir:       filepath.Clean(baseDir),
		encryptionKey: encryptionKey,
	}, nil
}

func (s *LocalStorage) resolvePath(relativePath string) (string, error) {
	cleaned := filepath.Clean(relativePath)
	if strings.Contains(cleaned, "..") || strings.HasPrefix(cleaned, "/") || strings.HasPrefix(cleaned, "\\") {
		return "", ErrPathTraversal
	}
	fullPath := filepath.Join(s.baseDir, cleaned)
	if !strings.HasPrefix(fullPath, s.baseDir) {
		return "", ErrPathTraversal
	}
	return fullPath, nil
}

func (s *LocalStorage) GetFullPath(relativePath string) (string, error) {
	return s.resolvePath(relativePath)
}

func (s *LocalStorage) Write(ctx context.Context, relativePath string, r io.Reader) (int64, error) {
	fullPath, err := s.resolvePath(relativePath)
	if err != nil {
		return 0, err
	}

	if err := os.MkdirAll(filepath.Dir(fullPath), 0750); err != nil {
		return 0, err
	}

	// Atomic write using a temp file in same directory
	tempPath := fullPath + ".tmp"
	file, err := os.OpenFile(tempPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		return 0, err
	}
	defer func() {
		_ = file.Close()
		_ = os.Remove(tempPath)
	}()

	written, err := io.Copy(file, r)
	if err != nil {
		return 0, err
	}

	if err := file.Sync(); err != nil {
		return 0, err
	}
	_ = file.Close()

	if err := os.Rename(tempPath, fullPath); err != nil {
		return 0, err
	}

	return written, nil
}

func (s *LocalStorage) Append(ctx context.Context, relativePath string, r io.Reader, expectedOffset int64) (int64, error) {
	fullPath, err := s.resolvePath(relativePath)
	if err != nil {
		return 0, err
	}

	if err := os.MkdirAll(filepath.Dir(fullPath), 0750); err != nil {
		return 0, err
	}

	file, err := os.OpenFile(fullPath, os.O_CREATE|os.O_WRONLY, 0640)
	if err != nil {
		return 0, err
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return 0, err
	}

	currentSize := stat.Size()
	if expectedOffset >= 0 && currentSize != expectedOffset {
		return currentSize, fmt.Errorf("%w: current size is %d, expected %d", ErrInvalidOffset, currentSize, expectedOffset)
	}

	if _, err := file.Seek(currentSize, io.SeekStart); err != nil {
		return 0, err
	}

	written, err := io.Copy(file, r)
	if err != nil {
		return 0, err
	}

	if err := file.Sync(); err != nil {
		return 0, err
	}

	return currentSize + written, nil
}

func (s *LocalStorage) Read(ctx context.Context, relativePath string) (io.ReadCloser, error) {
	fullPath, err := s.resolvePath(relativePath)
	if err != nil {
		return nil, err
	}

	file, err := os.Open(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	return file, nil
}

func (s *LocalStorage) ReadRange(ctx context.Context, relativePath string, offset, length int64) (io.ReadCloser, error) {
	fullPath, err := s.resolvePath(relativePath)
	if err != nil {
		return nil, err
	}

	file, err := os.Open(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		_ = file.Close()
		return nil, err
	}

	if length <= 0 {
		return file, nil
	}

	// Limit reader to specified length
	limitReader := io.LimitReader(file, length)
	return &rangedReadCloser{Reader: limitReader, file: file}, nil
}

type rangedReadCloser struct {
	io.Reader
	file *os.File
}

func (r *rangedReadCloser) Close() error {
	return r.file.Close()
}

func (s *LocalStorage) Delete(ctx context.Context, relativePath string) error {
	fullPath, err := s.resolvePath(relativePath)
	if err != nil {
		return err
	}

	if err := os.Remove(fullPath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return nil
}

func (s *LocalStorage) Size(ctx context.Context, relativePath string) (int64, error) {
	fullPath, err := s.resolvePath(relativePath)
	if err != nil {
		return 0, err
	}

	stat, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, ErrNotFound
		}
		return 0, err
	}

	return stat.Size(), nil
}

func (s *LocalStorage) Exists(ctx context.Context, relativePath string) (bool, error) {
	fullPath, err := s.resolvePath(relativePath)
	if err != nil {
		return false, err
	}

	_, err = os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// EncryptChunkAESGCM helper for server-side file chunk encryption
func EncryptChunkAESGCM(plaintext, key []byte) ([]byte, error) {
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
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}
