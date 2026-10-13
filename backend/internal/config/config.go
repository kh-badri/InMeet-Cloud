package config

import (
	"bufio"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                 string
	Env                  string
	AppURL               string
	Timezone             string
	DatabaseURL          string
	DBMaxOpenConns       int
	DBMaxIdleConns       int
	SessionSecret        []byte
	CSRFSecret           []byte
	StorageEncryptionKey []byte
	StorageDriver        string
	StorageLocalPath     string
	S3Endpoint           string
	S3Region             string
	S3Bucket             string
	S3AccessKey          string
	S3SecretKey          string
	S3UseSSL             bool
	RetentionTriggerDay  int
	DefaultMinKeep       int
	QuarantineDays       int
	InitialAdminEmail    string
	InitialAdminPassword string
	FrontendDir          string
	TelegramBotToken     string
	TelegramChatID       string
	SMTPHost             string
	SMTPPort             int
	SMTPUser             string
	SMTPPassword         string
	SMTPFrom             string
	NotifyEmail          string
}

// Load loads configuration from environment and optional .env file
func Load(envFile string) (*Config, error) {
	if envFile != "" {
		_ = loadDotEnv(envFile)
	}

	cfg := &Config{
		Port:                 getEnv("PORT", "8080"),
		Env:                  getEnv("ENV", "development"),
		AppURL:               getEnv("APP_URL", "http://localhost:8080"),
		Timezone:             getEnv("TIMEZONE", "Asia/Jakarta"),
		DatabaseURL:          getEnv("DATABASE_URL", "postgres://backupvault:backupvault_secret@127.0.0.1:5432/backupvault_db?sslmode=disable"),
		DBMaxOpenConns:       getEnvInt("DB_MAX_OPEN_CONNS", 25),
		DBMaxIdleConns:       getEnvInt("DB_MAX_IDLE_CONNS", 10),
		StorageDriver:        getEnv("STORAGE_DRIVER", "local"),
		StorageLocalPath:     getEnv("STORAGE_LOCAL_PATH", "/var/www/cloudinmeet/storage/backups"),
		S3Endpoint:           getEnv("S3_ENDPOINT", ""),
		S3Region:             getEnv("S3_REGION", "us-east-1"),
		S3Bucket:             getEnv("S3_BUCKET", "backupvault"),
		S3AccessKey:          getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey:          getEnv("S3_SECRET_KEY", ""),
		S3UseSSL:             getEnvBool("S3_USE_SSL", true),
		RetentionTriggerDay:  getEnvInt("RETENTION_TRIGGER_DAY", 30),
		DefaultMinKeep:       getEnvInt("DEFAULT_MIN_KEEP", 3),
		QuarantineDays:       getEnvInt("QUARANTINE_DAYS", 7),
		InitialAdminEmail:    getEnv("INITIAL_ADMIN_EMAIL", "admin@backupvault.local"),
		InitialAdminPassword: getEnv("INITIAL_ADMIN_PASSWORD", "AdminBackupVault2026!"),
		FrontendDir:          getEnv("FRONTEND_DIR", "/var/www/cloudinmeet/frontend/dist"),
		TelegramBotToken:     getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:       getEnv("TELEGRAM_CHAT_ID", ""),
		SMTPHost:             getEnv("SMTP_HOST", ""),
		SMTPPort:             getEnvInt("SMTP_PORT", 587),
		SMTPUser:             getEnv("SMTP_USER", ""),
		SMTPPassword:         getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:             getEnv("SMTP_FROM", "backupvault@example.com"),
		NotifyEmail:          getEnv("NOTIFY_EMAIL", ""),
	}

	sessionSecretStr := getEnv("SESSION_SECRET", "default-dev-session-secret-change-in-prod-min32")
	if len(sessionSecretStr) < 32 {
		return nil, fmt.Errorf("SESSION_SECRET must be at least 32 characters")
	}
	cfg.SessionSecret = []byte(sessionSecretStr)

	csrfSecretStr := getEnv("CSRF_SECRET", "default-dev-csrf-secret-change-in-prod-min32!!")
	if len(csrfSecretStr) < 32 {
		return nil, fmt.Errorf("CSRF_SECRET must be at least 32 characters")
	}
	cfg.CSRFSecret = []byte(csrfSecretStr)

	encHex := getEnv("STORAGE_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	keyBytes, err := hex.DecodeString(encHex)
	if err != nil || len(keyBytes) != 32 {
		return nil, fmt.Errorf("STORAGE_ENCRYPTION_KEY must be a 64-hex-character string (32 bytes AES-256 key)")
	}
	cfg.StorageEncryptionKey = keyBytes

	return cfg, nil
}

func (c *Config) IsProduction() bool {
	return strings.ToLower(c.Env) == "production"
}

func (c *Config) Location() *time.Location {
	loc, err := time.LoadLocation(c.Timezone)
	if err != nil {
		return time.FixedZone("WIB", 7*3600)
	}
	return loc
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && strings.TrimSpace(val) != "" {
		return strings.TrimSpace(val)
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val, ok := os.LookupEnv(key); ok {
		if i, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
			return i
		}
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if val, ok := os.LookupEnv(key); ok {
		if b, err := strconv.ParseBool(strings.TrimSpace(val)); err == nil {
			return b
		}
	}
	return defaultVal
}

func loadDotEnv(filepath string) error {
	file, err := os.Open(filepath)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			k := strings.TrimSpace(parts[0])
			v := strings.TrimSpace(parts[1])
			v = strings.Trim(v, `"'`)
			if _, exists := os.LookupEnv(k); !exists {
				_ = os.Setenv(k, v)
			}
		}
	}
	return scanner.Err()
}
