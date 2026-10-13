package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"backupvault/internal/model"
	"backupvault/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	AppClientContextKey = contextKey("current_client_app")
)

type UploadHandler struct {
	appService    *service.AppService
	uploadService *service.UploadService
}

func NewUploadHandler(appService *service.AppService, uploadService *service.UploadService) *UploadHandler {
	return &UploadHandler{
		appService:    appService,
		uploadService: uploadService,
	}
}

// RequireAPIKey validates client Bearer API key, checks IP allowlist, and sets application context
func (h *UploadHandler) RequireAPIKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing or invalid Bearer API key"})
			return
		}

		rawKey := strings.TrimPrefix(authHeader, "Bearer ")
		clientIP := GetClientIP(r)

		apiKey, app, err := h.appService.AuthenticateAPIKey(r.Context(), rawKey, clientIP)
		if err != nil {
			if err == service.ErrIPNotAllowed {
				WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
				return
			}
			WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized API key"})
			return
		}

		ctx := context.WithValue(r.Context(), APIKeyContextKey, apiKey)
		ctx = context.WithValue(ctx, AppClientContextKey, app)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetCurrentClientApp(ctx context.Context) *model.Application {
	if val := ctx.Value(AppClientContextKey); val != nil {
		if a, ok := val.(*model.Application); ok {
			return a
		}
	}
	return nil
}

type InitUploadRequest struct {
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	SHA256   string `json:"sha256"`
}

// HandleInitUpload initiates a chunked / resumable upload session
func (h *UploadHandler) HandleInitUpload(w http.ResponseWriter, r *http.Request) {
	app := GetCurrentClientApp(r.Context())
	if app == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req InitUploadRequest
	// Support JSON body or Tus-style headers
	if r.Header.Get("Content-Type") == "application/json" {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
	} else {
		req.Filename = r.Header.Get("Upload-Filename")
		if lenStr := r.Header.Get("Upload-Length"); lenStr != "" {
			req.Size, _ = strconv.ParseInt(lenStr, 10, 64)
		}
		req.SHA256 = r.Header.Get("X-Checksum-SHA256")
	}

	if req.Filename == "" || req.SHA256 == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "filename and sha256 checksum are required"})
		return
	}

	sess, err := h.uploadService.CreateSession(r.Context(), app, req.Filename, req.Size, req.SHA256)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	uploadURL := fmt.Sprintf("/api/v1/uploads/%s", sess.ID.String())
	w.Header().Set("Location", uploadURL)
	w.Header().Set("Tus-Resumable", "1.0.0")
	w.Header().Set("Upload-Offset", "0")

	WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"upload_id":     sess.ID.String(),
		"upload_url":    uploadURL,
		"filename":      sess.Filename,
		"file_type":     sess.FileType,
		"expected_size": sess.ExpectedSize,
		"expires_at":    sess.ExpiresAt,
	})
}

// HandleGetUploadOffset returns current offset for Tus or chunk resume
func (h *UploadHandler) HandleGetUploadOffset(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid upload ID"})
		return
	}

	sess, err := h.uploadService.GetSession(r.Context(), id)
	if err != nil {
		WriteJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Upload-Offset", strconv.FormatInt(sess.CurrentOffset, 10))
	w.Header().Set("Upload-Length", strconv.FormatInt(sess.ExpectedSize, 10))
	w.Header().Set("Tus-Resumable", "1.0.0")
	w.WriteHeader(http.StatusOK)
}

// HandleUploadChunk receives a streaming chunk and appends to the upload session
func (h *UploadHandler) HandleUploadChunk(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid upload ID"})
		return
	}

	offsetStr := r.Header.Get("Upload-Offset")
	var expectedOffset int64 = -1
	if offsetStr != "" {
		expectedOffset, _ = strconv.ParseInt(offsetStr, 10, 64)
	}

	newOffset, err := h.uploadService.AppendChunk(r.Context(), id, r.Body, expectedOffset)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Upload-Offset", strconv.FormatInt(newOffset, 10))
	w.Header().Set("Tus-Resumable", "1.0.0")
	w.WriteHeader(http.StatusNoContent)
}

// HandleCompleteUpload finalizes the upload and runs SHA-256 integrity verification
func (h *UploadHandler) HandleCompleteUpload(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid upload ID"})
		return
	}

	app := GetCurrentClientApp(r.Context())
	if app == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	clientIP := GetClientIP(r)
	backup, err := h.uploadService.CompleteSession(r.Context(), id, app, clientIP)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, backup)
}

// HandleDirectUpload handles single-shot direct streaming (curl one-liner from PRD 12)
func (h *UploadHandler) HandleDirectUpload(w http.ResponseWriter, r *http.Request) {
	app := GetCurrentClientApp(r.Context())
	if app == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	filename := r.Header.Get("X-Filename")
	if filename == "" {
		filename = r.URL.Query().Get("filename")
	}
	if filename == "" {
		filename = "backup.dump"
	}

	expectedSHA256 := r.Header.Get("X-Checksum-SHA256")
	if expectedSHA256 == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "header X-Checksum-SHA256 is required"})
		return
	}

	clientIP := GetClientIP(r)

	backup, err := h.uploadService.UploadDirect(r.Context(), app, filename, expectedSHA256, r.Body, clientIP)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusCreated, backup)
}
