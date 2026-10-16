package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
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

type BatchDeleteBackupsRequest struct {
	BackupIDs []uuid.UUID `json:"backup_ids"`
	TwoFACode string      `json:"two_fa_code"`
	Permanent bool        `json:"permanent"`
}

func (h *BackupHandler) HandleBatchDelete(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if user.Role != model.RoleAdmin || !user.CanDelete {
		WriteJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden: only admin with delete permission can delete backups"})
		return
	}

	var req BatchDeleteBackupsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.TwoFACode == "" {
		req.TwoFACode = r.Header.Get("X-2FA-Code")
	}
	if req.TwoFACode == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "kode verifikasi 2FA atau kata sandi diperlukan"})
		return
	}

	if len(req.BackupIDs) == 0 {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "tidak ada file backup yang dipilih"})
		return
	}

	clientIP := GetClientIP(r)
	ua := r.UserAgent()

	count, err := h.backupService.BatchDelete(r.Context(), req.BackupIDs, user.ID, req.TwoFACode, req.Permanent, clientIP, ua)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	msg := fmt.Sprintf("%d file backup berhasil dipindahkan ke karantina", count)
	if req.Permanent {
		msg = fmt.Sprintf("%d file backup berhasil dihapus permanen", count)
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"message":       msg,
		"deleted_count": count,
	})
}

func (h *BackupHandler) HandleBatchDownload(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if user.Role != model.RoleAdmin || !user.CanView {
		WriteJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden: only admin with view permission can download backups"})
		return
	}

	var backupIDs []uuid.UUID

	if r.Method == http.MethodGet {
		idsParam := r.URL.Query().Get("ids")
		if idsParam != "" {
			parts := strings.Split(idsParam, ",")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if id, err := uuid.Parse(p); err == nil {
					backupIDs = append(backupIDs, id)
				}
			}
		}
	} else {
		var req struct {
			BackupIDs []uuid.UUID `json:"backup_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			backupIDs = req.BackupIDs
		}
	}

	if len(backupIDs) == 0 {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "tidak ada file backup yang dipilih untuk diunduh"})
		return
	}

	clientIP := GetClientIP(r)
	ua := r.UserAgent()

	if err := h.backupService.BatchZipBackups(r.Context(), backupIDs, user.ID, clientIP, ua, w); err != nil {
		http.Error(w, "gagal membuat arsip zip backup: "+err.Error(), http.StatusInternalServerError)
		return
	}
}
