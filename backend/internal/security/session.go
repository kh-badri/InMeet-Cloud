package security

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"time"
)

const (
	SessionCookieName = "bv_session"
	CSRFCookieName    = "bv_csrf"
	CSRFHeaderName    = "X-CSRF-Token"
	SessionDuration   = 24 * time.Hour
)

// GenerateSessionID generates 256-bit cryptographically secure session ID
func GenerateSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// GenerateCSRFToken generates 256-bit CSRF token
func GenerateCSRFToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// SetSessionCookie sets HttpOnly, Secure, SameSite=Strict session cookie
func SetSessionCookie(w http.ResponseWriter, sessionID string, expiresAt time.Time, isSecure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    sessionID,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   isSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

// SetCSRFCookie sets readable CSRF token cookie for frontend client
func SetCSRFCookie(w http.ResponseWriter, csrfToken string, expiresAt time.Time, isSecure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    csrfToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: false, // Accessible by frontend JS to set X-CSRF-Token header
		Secure:   isSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

// ClearSessionCookies expires both session and CSRF cookies
func ClearSessionCookies(w http.ResponseWriter, isSecure bool) {
	past := time.Now().Add(-24 * time.Hour)
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  past,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecure,
		SameSite: http.SameSiteStrictMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    "",
		Path:     "/",
		Expires:  past,
		MaxAge:   -1,
		HttpOnly: false,
		Secure:   isSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

// ValidateCSRF compares expected CSRF token against request header in constant time
func ValidateCSRF(expectedToken, headerToken string) bool {
	if expectedToken == "" || headerToken == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(expectedToken), []byte(headerToken)) == 1
}
