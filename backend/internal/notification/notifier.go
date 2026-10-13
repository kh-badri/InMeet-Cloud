package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	"backupvault/internal/config"
)

type Notifier struct {
	cfg        *config.Config
	httpClient *http.Client
}

func NewNotifier(cfg *config.Config) *Notifier {
	return &Notifier{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Send sends notification to Telegram and/or Email according to configuration
func (n *Notifier) Send(ctx context.Context, title, message string, isAlert bool) {
	if n.cfg.TelegramBotToken != "" && n.cfg.TelegramChatID != "" {
		if err := n.SendTelegram(ctx, title, message, isAlert); err != nil {
			slog.Error("Failed to send Telegram notification", "error", err)
		}
	}

	if n.cfg.SMTPHost != "" && n.cfg.NotifyEmail != "" {
		if err := n.SendEmail(ctx, title, message); err != nil {
			slog.Error("Failed to send Email notification", "error", err)
		}
	}
}

func (n *Notifier) SendTelegram(ctx context.Context, title, message string, isAlert bool) error {
	emoji := "ℹ️"
	if isAlert {
		emoji = "⚠️"
	}

	text := fmt.Sprintf("%s *[InMeet Cloud]* %s\n\n%s", emoji, escapeMarkdown(title), escapeMarkdown(message))

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", n.cfg.TelegramBotToken)
	body, _ := json.Marshal(map[string]interface{}{
		"chat_id":    n.cfg.TelegramChatID,
		"text":       text,
		"parse_mode": "Markdown",
	})

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("telegram api error: status %d", resp.StatusCode)
	}

	return nil
}

func (n *Notifier) SendEmail(ctx context.Context, subject, body string) error {
	from := n.cfg.SMTPFrom
	to := []string{n.cfg.NotifyEmail}
	addr := fmt.Sprintf("%s:%d", n.cfg.SMTPHost, n.cfg.SMTPPort)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: [InMeet Cloud] %s\r\n\r\n%s\r\n", from, strings.Join(to, ","), subject, body)

	var auth smtp.Auth
	if n.cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", n.cfg.SMTPUser, n.cfg.SMTPPassword, n.cfg.SMTPHost)
	}

	return smtp.SendMail(addr, auth, from, to, []byte(msg))
}

func escapeMarkdown(text string) string {
	replacer := strings.NewReplacer(
		"_", "\\_",
		"*", "\\*",
		"[", "\\[",
		"`", "\\`",
	)
	return replacer.Replace(text)
}
