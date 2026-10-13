package security

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

type visitor struct {
	tokens     float64
	lastRefill time.Time
}

type IPRateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     float64 // tokens per second
	capacity float64 // max burst
}

func NewIPRateLimiter(ratePerMinute int, burst int) *IPRateLimiter {
	return &IPRateLimiter{
		visitors: make(map[string]*visitor),
		rate:     float64(ratePerMinute) / 60.0,
		capacity: float64(burst),
	}
}

func (limiter *IPRateLimiter) Allow(ip string) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	now := time.Now()
	v, exists := limiter.visitors[ip]
	if !exists {
		limiter.visitors[ip] = &visitor{
			tokens:     limiter.capacity - 1,
			lastRefill: now,
		}
		return true
	}

	// Refill tokens
	elapsed := now.Sub(v.lastRefill).Seconds()
	v.tokens += elapsed * limiter.rate
	if v.tokens > limiter.capacity {
		v.tokens = limiter.capacity
	}
	v.lastRefill = now

	if v.tokens >= 1.0 {
		v.tokens -= 1.0
		return true
	}

	return false
}

// Cleanup removes stale IP entries to prevent memory growth
func (limiter *IPRateLimiter) Cleanup(olderThan time.Duration) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	now := time.Now()
	for ip, v := range limiter.visitors {
		if now.Sub(v.lastRefill) > olderThan {
			delete(limiter.visitors, ip)
		}
	}
}

// RateLimitMiddleware enforces rate limiting per client IP
func RateLimitMiddleware(limiter *IPRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := extractIP(r)

			if !limiter.Allow(ip) {
				w.Header().Set("Retry-After", "5")
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(`{"error":"too many requests, please slow down"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func extractIP(r *http.Request) string {
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
	idx := strings.LastIndex(r.RemoteAddr, ":")
	if idx != -1 {
		return r.RemoteAddr[:idx]
	}
	return r.RemoteAddr
}
