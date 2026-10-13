package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"time"

	"backupvault/internal/model"
	"backupvault/internal/repository"
	"backupvault/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type BackupHandler struct {
	backupService *service.BackupService
}

func NewBackupHandler(backupService *service.BackupService) *BackupHandler {
	return &BackupHandler{backupService: backupService}
}

func (h *BackupHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	filter := repository.BackupFilter{
		Status:   q.Get("status"),
		FileType: q.Get("file_type"),
		Query:    q.Get("q"),
	}

	if appStr := q.Get("app"); appStr != "" {
		if appID, err := uuid.Parse(appStr); err == nil {
			filter.AppID = &appID
		}
	}

	if fromStr := q.Get("date_from"); fromStr != "" {
		if t, err := time.Parse("2006-01-02", fromStr); err == nil {
			filter.DateFrom = &t
		}
	}

	if toStr := q.Get("date_to"); toStr != "" {
		if t, err := time.Parse("2006-01-02", toStr); err == nil {
			t = t.Add(24*time.Hour - time.Nanosecond)
			filter.DateTo = &t
		}
	}

	if limitStr := q.Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			filter.Limit = l
		}
	}
	if offsetStr := q.Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			filter.Offset = o
		}
	}

	backups, total, err := h.backupService.ListBackups(r.Context(), filter)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"backups": backups,
		"total":   total,
		"limit":   filter.Limit,
		"offset":  filter.Offset,
	})
}

func (h *BackupHandler) HandleGet(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid backup ID"})
		return
	}

	backup, err := h.backupService.GetBackup(r.Context(), id)
	if err != nil {
		WriteJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, backup)
}

func (h *BackupHandler) HandleCreateDownloadLink(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid backup ID"})
		return
	}

	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	clientIP := GetClientIP(r)
	ua := r.UserAgent()

	res, err := h.backupService.CreateDownloadLink(r.Context(), id, user.ID, clientIP, ua)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

// HandleDownload serves the file securely supporting HTTP Range requests
func (h *BackupHandler) HandleDownload(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		http.Error(w, "missing download token", http.StatusBadRequest)
		return
	}

	clientIP := GetClientIP(r)
	ua := r.UserAgent()

	backup, fullPath, _, err := h.backupService.ResolveDownload(r.Context(), token, clientIP, ua)
	if err != nil {
		http.Error(w, err.Error(), http.StatusGone)
		return
	}

	file, err := os.Open(fullPath)
	if err != nil {
		http.Error(w, "file not found on disk", http.StatusNotFound)
		return
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		http.Error(w, "failed to stat file", http.StatusInternalServerError)
		return
	}

	// Security download headers
	w.Header().Set("Content-Disposition", `attachment; filename="`+backup.Filename+`"`)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	// http.ServeContent natively handles HTTP Range / resume support!
	http.ServeContent(w, r, backup.Filename, stat.ModTime(), file)
}

type DeleteBackupRequest struct {
	TwoFACode string `json:"two_fa_code"`
	Permanent bool   `json:"permanent"`
}

func (h *BackupHandler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid backup ID"})
		return
	}

	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if user.Role != model.RoleAdmin {
		WriteJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden: only admin can delete backups"})
		return
	}

	var req DeleteBackupRequest
	if r.Header.Get("Content-Type") == "application/json" {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.TwoFACode == "" {
		req.TwoFACode = r.Header.Get("X-2FA-Code")
	}

	if req.TwoFACode == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "2FA verification code is required for manual delete"})
		return
	}

	clientIP := GetClientIP(r)
	ua := r.UserAgent()

	err = h.backupService.ManualDelete(r.Context(), id, user.ID, req.TwoFACode, req.Permanent, clientIP, ua)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	actionMsg := "Backup quarantined successfully"
	if req.Permanent {
		actionMsg = "Backup permanently deleted"
	}
	WriteJSON(w, http.StatusOK, map[string]string{"message": actionMsg})
}
