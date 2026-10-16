package handler

import (
	"encoding/json"
	"net/http"

	"backupvault/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type AppHandler struct {
	appService *service.AppService
}

func NewAppHandler(appService *service.AppService) *AppHandler {
	return &AppHandler{appService: appService}
}

type CreateAppRequest struct {
	Name          string `json:"name"`
	DisplayName   string `json:"display_name"`
	Description   string `json:"description"`
	RetentionDays int    `json:"retention_days"`
	MinKeep       int    `json:"min_keep"`
}

type UpdateAppRequest struct {
	Name          string `json:"name"`
	DisplayName   string `json:"display_name"`
	Description   string `json:"description"`
	RetentionDays int    `json:"retention_days"`
	MinKeep       int    `json:"min_keep"`
	IsActive      bool   `json:"is_active"`
}

type CreateApiKeyRequest struct {
	Name        string `json:"name"`
	IPAllowlist string `json:"ip_allowlist"`
}

func (h *AppHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	apps, err := h.appService.ListApps(r.Context())
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	WriteJSON(w, http.StatusOK, apps)
}

func (h *AppHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	var req CreateAppRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	user := GetCurrentUser(r.Context())
	actorID := "anonymous"
	actorEmail := ""
	if user != nil {
		actorID = user.ID.String()
		actorEmail = user.Email
	}

	app, err := h.appService.CreateApp(r.Context(), req.Name, req.DisplayName, req.Description, req.RetentionDays, req.MinKeep, actorID, actorEmail, GetClientIP(r), r.UserAgent())
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusCreated, app)
}

func (h *AppHandler) HandleGet(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid application ID"})
		return
	}

	app, err := h.appService.GetApp(r.Context(), id)
	if err != nil {
		WriteJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, app)
}

func (h *AppHandler) HandleUpdate(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid application ID"})
		return
	}

	var req UpdateAppRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	user := GetCurrentUser(r.Context())
	actorID := "anonymous"
	actorEmail := ""
	if user != nil {
		actorID = user.ID.String()
		actorEmail = user.Email
	}

	app, err := h.appService.UpdateApp(r.Context(), id, req.Name, req.DisplayName, req.Description, req.RetentionDays, req.MinKeep, req.IsActive, actorID, actorEmail, GetClientIP(r), r.UserAgent())
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, app)
}

func (h *AppHandler) HandleListKeys(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid application ID"})
		return
	}

	keys, err := h.appService.ListApiKeys(r.Context(), id)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, keys)
}

func (h *AppHandler) HandleCreateKey(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid application ID"})
		return
	}

	var req CreateApiKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	user := GetCurrentUser(r.Context())
	actorID := "anonymous"
	actorEmail := ""
	if user != nil {
		actorID = user.ID.String()
		actorEmail = user.Email
	}

	key, err := h.appService.CreateApiKey(r.Context(), id, req.Name, req.IPAllowlist, actorID, actorEmail, GetClientIP(r), r.UserAgent())
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusCreated, key)
}

func (h *AppHandler) HandleRevokeKey(w http.ResponseWriter, r *http.Request) {
	keyIDStr := chi.URLParam(r, "keyId")
	keyID, err := uuid.Parse(keyIDStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid api key ID"})
		return
	}

	user := GetCurrentUser(r.Context())
	actorID := "anonymous"
	actorEmail := ""
	if user != nil {
		actorID = user.ID.String()
		actorEmail = user.Email
	}

	if err := h.appService.RevokeApiKey(r.Context(), keyID, actorID, actorEmail, GetClientIP(r), r.UserAgent()); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "API key revoked successfully"})
}

func (h *AppHandler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid application ID"})
		return
	}

	user := GetCurrentUser(r.Context())
	actorID := "anonymous"
	actorEmail := ""
	if user != nil {
		actorID = user.ID.String()
		actorEmail = user.Email
	}

	if err := h.appService.DeleteApp(r.Context(), id, actorID, actorEmail, GetClientIP(r), r.UserAgent()); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Aplikasi berhasil dihapus"})
}

