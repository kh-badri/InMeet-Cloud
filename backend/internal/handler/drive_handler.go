package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"backupvault/internal/model"
	"backupvault/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type DriveHandler struct {
	driveService *service.DriveService
}

func NewDriveHandler(driveService *service.DriveService) *DriveHandler {
	return &DriveHandler{driveService: driveService}
}

func (h *DriveHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	q := r.URL.Query().Get("q")
	var parentID *uuid.UUID

	if parentStr := r.URL.Query().Get("parent_id"); parentStr != "" && parentStr != "null" && parentStr != "root" {
		if pid, err := uuid.Parse(parentStr); err == nil {
			parentID = &pid
		}
	}

	res, err := h.driveService.ListItems(r.Context(), user.ID, parentID, q)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

type CreateFolderRequest struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id"`
}

func (h *DriveHandler) HandleCreateFolder(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req CreateFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	var parentID *uuid.UUID
	if req.ParentID != nil && *req.ParentID != "" && *req.ParentID != "null" && *req.ParentID != "root" {
		if pid, err := uuid.Parse(*req.ParentID); err == nil {
			parentID = &pid
		}
	}

	item, err := h.driveService.CreateFolder(r.Context(), user.ID, parentID, req.Name)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusCreated, item)
}

func (h *DriveHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Limit request size to 10GB for Drive uploads
	r.Body = http.MaxBytesReader(w, r.Body, 10<<30)
	if err := r.ParseMultipartForm(64 << 20); err != nil { // 64MB memory buffer
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "gagal membaca data multipart: " + err.Error()})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "file field is required"})
		return
	}
	defer file.Close()

	var parentID *uuid.UUID
	parentStr := r.FormValue("parent_id")
	if parentStr != "" && parentStr != "null" && parentStr != "root" {
		if pid, err := uuid.Parse(parentStr); err == nil {
			parentID = &pid
		}
	}

	relativePath := r.FormValue("relative_path")
	mimeType := header.Header.Get("Content-Type")

	item, err := h.driveService.UploadFile(
		r.Context(),
		user.ID,
		parentID,
		relativePath,
		header.Filename,
		file,
		header.Size,
		mimeType,
	)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusCreated, item)
}

func (h *DriveHandler) HandleDownload(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid item ID", http.StatusBadRequest)
		return
	}

	item, err := h.driveService.GetItem(r.Context(), user.ID, id)
	if err != nil {
		http.Error(w, "item tidak ditemukan", http.StatusNotFound)
		return
	}

	// Folder download -> streamed ZIP archive
	if item.Type == model.DriveItemTypeFolder {
		if err := h.driveService.ZipFolder(r.Context(), user.ID, item.ID, w); err != nil {
			http.Error(w, "gagal membuat arsip zip: "+err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// File download -> direct stream with resume/range support
	diskFile, err := os.Open(item.StoragePath)
	if err != nil {
		http.Error(w, "berkas tidak ditemukan di penyimpanan server", http.StatusNotFound)
		return
	}
	defer diskFile.Close()

	stat, err := diskFile.Stat()
	if err != nil {
		http.Error(w, "gagal membaca informasi berkas", http.StatusInternalServerError)
		return
	}

	isInline := r.URL.Query().Get("inline") == "true" || r.URL.Query().Get("inline") == "1"
	disposition := "attachment"
	if isInline {
		disposition = "inline"
	}

	w.Header().Set("Content-Disposition", disposition+`; filename="`+item.Name+`"`)
	if item.MimeType != "" {
		w.Header().Set("Content-Type", item.MimeType)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")

	http.ServeContent(w, r, item.Name, stat.ModTime(), diskFile)
}

func (h *DriveHandler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid item ID"})
		return
	}

	if err := h.driveService.DeleteItem(r.Context(), user.ID, id); err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "item berhasil dihapus"})
}

type RenameRequest struct {
	Name string `json:"name"`
}

func (h *DriveHandler) HandleRename(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid item ID"})
		return
	}

	var req RenameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	cleanName := strings.TrimSpace(req.Name)
	if cleanName == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "nama tidak boleh kosong"})
		return
	}

	if err := h.driveService.RenameItem(r.Context(), user.ID, id, cleanName); err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "berhasil mengubah nama", "name": cleanName})
}
