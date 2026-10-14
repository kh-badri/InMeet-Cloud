package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
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

func isPermissionDenied(err error) bool {
	return errors.Is(err, service.ErrPermissionViewDenied) ||
		errors.Is(err, service.ErrPermissionEditDenied) ||
		errors.Is(err, service.ErrPermissionDeleteDenied) ||
		errors.Is(err, service.ErrViewerReadOnly)
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

	var targetUserID *uuid.UUID
	if user.Role != model.RoleUser {
		if uidStr := r.URL.Query().Get("user_id"); uidStr != "" && uidStr != "all" && uidStr != "null" {
			if uid, err := uuid.Parse(uidStr); err == nil {
				targetUserID = &uid
			}
		}
	}

	res, err := h.driveService.ListItems(r.Context(), user, targetUserID, parentID, q)
	if err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
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

	item, err := h.driveService.CreateFolder(r.Context(), user, parentID, req.Name)
	if err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
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
		user,
		parentID,
		relativePath,
		header.Filename,
		file,
		header.Size,
		mimeType,
	)
	if err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
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

	item, err := h.driveService.GetItem(r.Context(), user, id)
	if err != nil {
		http.Error(w, "item tidak ditemukan", http.StatusNotFound)
		return
	}

	h.driveService.LogAudit(r.Context(), user.ID, "drive_item_downloaded", item.ID.String(), map[string]interface{}{
		"name":       item.Name,
		"type":       item.Type,
		"size_bytes": item.SizeBytes,
		"owner_id":   item.UserID.String(),
	})

	// Folder download -> streamed ZIP archive
	if item.Type == model.DriveItemTypeFolder {
		if err := h.driveService.ZipFolder(r.Context(), user, item.ID, w); err != nil {
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

	if err := h.driveService.DeleteItem(r.Context(), user, id); err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
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

	if err := h.driveService.RenameItem(r.Context(), user, id, cleanName); err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "berhasil mengubah nama", "name": cleanName})
}

func (h *DriveHandler) HandleMove(w http.ResponseWriter, r *http.Request) {
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

	var req model.MoveDriveItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if err := h.driveService.MoveItem(r.Context(), user, id, req.TargetParentID); err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "item berhasil dipindahkan"})
}

func (h *DriveHandler) HandleListFolders(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var targetUserID *uuid.UUID
	if user.Role != model.RoleUser {
		if uidStr := r.URL.Query().Get("user_id"); uidStr != "" && uidStr != "all" && uidStr != "null" {
			if uid, err := uuid.Parse(uidStr); err == nil {
				targetUserID = &uid
			}
		}
	}

	folders, err := h.driveService.ListAllFolders(r.Context(), user, targetUserID)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, folders)
}

func (h *DriveHandler) HandleInitUpload(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req model.InitUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	res, err := h.driveService.InitUploadSession(r.Context(), user, &req)
	if err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

func (h *DriveHandler) HandleUploadChunk(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// 64MB max chunk read limit
	r.Body = http.MaxBytesReader(w, r.Body, 64<<20)

	uploadIDStr := r.FormValue("upload_id")
	if uploadIDStr == "" {
		uploadIDStr = r.URL.Query().Get("upload_id")
	}
	uploadID, err := uuid.Parse(uploadIDStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid upload_id"})
		return
	}

	chunkIdxStr := r.FormValue("chunk_index")
	if chunkIdxStr == "" {
		chunkIdxStr = r.URL.Query().Get("chunk_index")
	}
	chunkIndex := 0
	if _, err := fmt.Sscanf(chunkIdxStr, "%d", &chunkIndex); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid chunk_index"})
		return
	}

	file, _, err := r.FormFile("chunk")
	var chunkReader io.Reader = file
	if err != nil {
		chunkReader = r.Body
	} else {
		defer file.Close()
	}

	uploadedBytes, err := h.driveService.SaveChunk(r.Context(), user, uploadID, chunkIndex, chunkReader)
	if err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":        true,
		"chunk_index":    chunkIndex,
		"uploaded_bytes": uploadedBytes,
	})
}

func (h *DriveHandler) HandleCompleteUpload(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req model.CompleteUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	item, err := h.driveService.CompleteUploadSession(r.Context(), user, req.UploadID)
	if err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, item)
}

func (h *DriveHandler) HandleGetUploadSessions(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	sessions, err := h.driveService.GetActiveUploadSessions(r.Context(), user)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, sessions)
}

func (h *DriveHandler) HandleAbortUpload(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid upload ID"})
		return
	}

	if err := h.driveService.AbortUploadSession(r.Context(), user, id); err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "sesi upload dibatalkan"})
}

func (h *DriveHandler) HandleListTrash(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var targetUserID *uuid.UUID
	if user.Role != model.RoleUser {
		if uidStr := r.URL.Query().Get("user_id"); uidStr != "" && uidStr != "all" && uidStr != "null" {
			if uid, err := uuid.Parse(uidStr); err == nil {
				targetUserID = &uid
			}
		}
	}

	items, err := h.driveService.ListTrash(r.Context(), user, targetUserID)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"items": items,
	})
}

func (h *DriveHandler) HandleRestoreTrash(w http.ResponseWriter, r *http.Request) {
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

	if err := h.driveService.RestoreItem(r.Context(), user, id); err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "item berhasil dipulihkan"})
}

func (h *DriveHandler) HandlePermanentDeleteTrash(w http.ResponseWriter, r *http.Request) {
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

	if err := h.driveService.PermanentDeleteItem(r.Context(), user, id); err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "item berhasil dihapus secara permanen"})
}

func (h *DriveHandler) HandleEmptyTrash(w http.ResponseWriter, r *http.Request) {
	user := GetCurrentUser(r.Context())
	if user == nil {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var targetUserID *uuid.UUID
	if user.Role != model.RoleUser {
		if uidStr := r.URL.Query().Get("user_id"); uidStr != "" && uidStr != "all" && uidStr != "null" {
			if uid, err := uuid.Parse(uidStr); err == nil {
				targetUserID = &uid
			}
		}
	}

	if err := h.driveService.EmptyTrash(r.Context(), user, targetUserID); err != nil {
		if isPermissionDenied(err) {
			WriteJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "seluruh isi sampah berhasil dikosongkan"})
}
