package security

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIPRateLimiter(t *testing.T) {
	// Limiter with 60 requests per minute, burst of 3
	limiter := NewIPRateLimiter(60, 3)

	ip := "192.168.1.50"

	// First 3 requests should succeed
	for i := 0; i < 3; i++ {
		if !limiter.Allow(ip) {
			t.Errorf("Request %d should be allowed", i+1)
		}
	}

	// 4th burst request should be rejected
	if limiter.Allow(ip) {
		t.Errorf("Request 4 should be rejected due to rate limit")
	}

	// Different IP should still be allowed
	if !limiter.Allow("10.0.0.1") {
		t.Errorf("Request from different IP should be allowed")
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	limiter := NewIPRateLimiter(60, 2)
	middleware := RateLimitMiddleware(limiter)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Request 1
	req1 := httptest.NewRequest("GET", "/test", nil)
	req1.RemoteAddr = "1.2.3.4:1234"
	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w1.Code)
	}

	// Request 2
	req2 := httptest.NewRequest("GET", "/test", nil)
	req2.RemoteAddr = "1.2.3.4:1234"
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w2.Code)
	}

	// Request 3 (exceeds burst of 2)
	req3 := httptest.NewRequest("GET", "/test", nil)
	req3.RemoteAddr = "1.2.3.4:1234"
	w3 := httptest.NewRecorder()
	handler.ServeHTTP(w3, req3)
	if w3.Code != http.StatusTooManyRequests {
		t.Errorf("Expected 429 Too Many Requests, got %d", w3.Code)
	}
}
