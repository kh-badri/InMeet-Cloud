package handler

import (
	"context"
	"net"
	"net/http"
	"strings"

	"backupvault/internal/model"
	"backupvault/internal/security"
	"backupvault/internal/service"
)

type contextKey string

const (
	UserContextKey    contextKey = "current_user"
	SessionContextKey contextKey = "current_session"
	APIKeyContextKey  contextKey = "current_api_key"
)

// SecurityHeadersMiddleware sets strict security headers
func SecurityHeadersMiddleware(isProd bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
			w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';")

			if isProd {
				w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
			}

			next.ServeHTTP(w, r)
		})
	}
}

// AuthMiddleware loads authenticated user from session cookie
func AuthMiddleware(authService *service.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(security.SessionCookieName)
			if err != nil || cookie.Value == "" {
				next.ServeHTTP(w, r)
				return
			}

			user, sess, err := authService.ValidateSession(r.Context(), cookie.Value)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), UserContextKey, user)
			ctx = context.WithValue(ctx, SessionContextKey, sess)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAuth enforces authenticated session
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := GetCurrentUser(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAdmin enforces admin role
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := GetCurrentUser(r.Context())
		if user == nil || user.Role != model.RoleAdmin {
			http.Error(w, `{"error":"forbidden: admin access required"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// CSRFMiddleware checks CSRF token for mutating requests when user session is present
func CSRFMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Only check state changing methods
			if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
				next.ServeHTTP(w, r)
				return
			}

			// If API Key is being used (e.g. client upload endpoints), CSRF does not apply
			if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
				next.ServeHTTP(w, r)
				return
			}

			sess := GetCurrentSession(r.Context())
			if sess != nil {
				clientToken := r.Header.Get(security.CSRFHeaderName)
				if clientToken == "" {
					clientToken = r.Header.Get("X-XSRF-Token")
				}

				if !security.ValidateCSRF(sess.CSRFToken, clientToken) {
					http.Error(w, `{"error":"invalid or missing CSRF token"}`, http.StatusForbidden)
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

func GetCurrentUser(ctx context.Context) *model.User {
	if val := ctx.Value(UserContextKey); val != nil {
		if u, ok := val.(*model.User); ok {
			return u
		}
	}
	return nil
}

func GetCurrentSession(ctx context.Context) *model.Session {
	if val := ctx.Value(SessionContextKey); val != nil {
		if s, ok := val.(*model.Session); ok {
			return s
		}
	}
	return nil
}

func GetClientIP(r *http.Request) string {
	// If behind trusted proxy (Nginx)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}
