package handler

import (
	"encoding/json"
	"net/http"

	"backupvault/internal/config"
	"backupvault/internal/security"
	"backupvault/internal/service"
)

type AuthHandler struct {
	cfg         *config.Config
	authService *service.AuthService
}

func NewAuthHandler(cfg *config.Config, authService *service.AuthService) *AuthHandler {
	return &AuthHandler{
		cfg:         cfg,
		authService: authService,
	}
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type Verify2FARequest struct {
	Ticket string `json:"ticket"`
	Code   string `json:"code"`
}

type TOTPConfirmRequest struct {
	Passcode      string   `json:"passcode"`
	RecoveryCodes []string `json:"recovery_codes"`
}

type TOTPDisableRequest struct {
	Passcode string `json:"passcode"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type UpdateProfileRequest struct {
	Email           string `json:"email"`
	CurrentPassword string `json:"current_password"`
}

func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	ip := GetClientIP(r)
	ua := r.UserAgent()

	res, err := h.authService.Login(r.Context(), req.Email, req.Password, ip, ua)
	if err != nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	if res.Requires2FA {
		WriteJSON(w, http.StatusOK, map[string]interface{}{
			"requires_2fa": true,
			"ticket":       res.TwoFATicket,
		})
		return
	}

	// Set cookies
	security.SetSessionCookie(w, res.Session.ID, res.Session.ExpiresAt, h.cfg.IsProduction())
	security.SetCSRFCookie(w, res.Session.CSRFToken, res.Session.ExpiresAt, h.cfg.IsProduction())

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"requires_2fa": false,
		"user":         res.User,
		"csrf_token":   res.Session.CSRFToken,
	})
}

func (h *AuthHandler) HandleVerify2FA(w http.ResponseWriter, r *http.Request) {
	var req Verify2FARequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	ip := GetClientIP(r)
	ua := r.UserAgent()

	sess, user, err := h.authService.Verify2FA(r.Context(), req.Ticket, req.Code, ip, ua)
	if err != nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	security.SetSessionCookie(w, sess.ID, sess.ExpiresAt, h.cfg.IsProduction())
	security.SetCSRFCookie(w, sess.CSRFToken, sess.ExpiresAt, h.cfg.IsProduction())

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"user":       user,
		"csrf_token": sess.CSRFToken,
	})
}

func (h *AuthHandler) HandleLogout(w http.ResponseWriter, r *http.Request) {
	sess := GetCurrentSession(r.Context())
	if sess != nil {
		_ = h.authService.Logout(r.Context(), sess.ID, GetClientIP(r), r.UserAgent())
	}

	security.ClearSessionCookies(w, h.cfg.IsProduction())
	WriteJSON(w, http.StatusOK, map[string]string{"message": "logged out successfully"})
}

func (h *AuthHandler) HandleMe(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	sess := GetCurrentSession(r.Context())
	csrfToken := ""
	if sess != nil {
		csrfToken = sess.CSRFToken
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"user":       user,
		"csrf_token": csrfToken,
	})
}

func (h *AuthHandler) HandleSetupTOTP(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	setup, err := h.authService.SetupTOTP(r.Context(), user.ID)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, setup)
}

func (h *AuthHandler) HandleConfirmTOTP(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req TOTPConfirmRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	err := h.authService.ConfirmEnableTOTP(r.Context(), user.ID, req.Passcode, req.RecoveryCodes, GetClientIP(r), r.UserAgent())
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "2FA successfully enabled"})
}

func (h *AuthHandler) HandleDisableTOTP(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req TOTPDisableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	err := h.authService.DisableTOTP(r.Context(), user.ID, req.Passcode, GetClientIP(r), r.UserAgent())
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "2FA disabled"})
}

func (h *AuthHandler) HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if err := h.authService.ChangePassword(r.Context(), user.ID, req.CurrentPassword, req.NewPassword, GetClientIP(r), r.UserAgent()); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "password berhasil diubah"})
}

func (h *AuthHandler) HandleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	updatedUser, err := h.authService.UpdateEmail(r.Context(), user.ID, req.Email, req.CurrentPassword, GetClientIP(r), r.UserAgent())
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"message": "profil berhasil diperbarui",
		"user":    updatedUser,
	})
}

func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
