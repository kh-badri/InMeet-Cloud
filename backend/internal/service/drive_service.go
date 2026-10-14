package service

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"backupvault/internal/model"
	"backupvault/internal/repository"

	"github.com/google/uuid"
)

var (
	ErrInvalidItemName    = errors.New("nama berkas atau folder tidak valid")
	ErrParentNotFound     = errors.New("folder induk tidak ditemukan")
	ErrInvalidDestination     = errors.New("folder tujuan tidak valid")
	ErrCircularFolderMove     = errors.New("tidak dapat memindahkan folder ke dalam subfolder turunannya")
	ErrPermissionViewDenied   = errors.New("akun Anda tidak memiliki izin untuk melihat atau mengunduh data")
	ErrPermissionEditDenied   = errors.New("akun Anda tidak memiliki izin untuk mengedit atau mengunggah data")
	ErrPermissionDeleteDenied = errors.New("akun Anda tidak memiliki izin untuk menghapus data")
	ErrViewerReadOnly         = ErrPermissionEditDenied
	ErrAccessDenied           = errors.New("akses ditolak")
)

type DriveService struct {
	repo      *repository.DriveRepository
	baseDir   string
	auditRepo *repository.AuditRepository
	userRepo  *repository.UserRepository
}

func NewDriveService(repo *repository.DriveRepository, baseDir string, auditRepo *repository.AuditRepository, userRepo *repository.UserRepository) *DriveService {
	_ = os.MkdirAll(baseDir, 0750)
	return &DriveService{
		repo:      repo,
		baseDir:   filepath.Clean(baseDir),
		auditRepo: auditRepo,
		userRepo:  userRepo,
	}
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func (s *DriveService) LogAudit(ctx context.Context, userID uuid.UUID, action, targetID string, details map[string]interface{}) {
	if s.auditRepo != nil {
		_ = s.auditRepo.LogCtx(ctx, "user", userID.String(), action, "drive", targetID, details)
	}
}

func (s *DriveService) ListItems(ctx context.Context, caller *model.User, targetUserID *uuid.UUID, parentID *uuid.UUID, query string) (*model.DriveListResponse, error) {
	if caller == nil {
		return nil, ErrAccessDenied
	}
	if !caller.CanView {
		return nil, ErrPermissionViewDenied
	}

	var effectiveUserID *uuid.UUID
	if caller.Role == model.RoleUser {
		effectiveUserID = &caller.ID
	} else {
		effectiveUserID = targetUserID
	}

	items, err := s.repo.List(ctx, effectiveUserID, parentID, query)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil daftar item: %w", err)
	}

	var currentFolder *model.DriveItem
	var breadcrumbs []model.DriveBreadcrumb

	if parentID != nil {
		if caller.Role == model.RoleUser {
			currentFolder, err = s.repo.GetByID(ctx, *parentID, caller.ID)
		} else {
			currentFolder, err = s.repo.GetByIDAny(ctx, *parentID)
		}
		if err != nil && !errors.Is(err, repository.ErrDriveItemNotFound) {
			return nil, fmt.Errorf("gagal mengambil detail folder: %w", err)
		}

		crumbs, err := s.repo.GetBreadcrumbs(ctx, *parentID)
		if err == nil {
			breadcrumbs = crumbs
		}
	}

	totalItems, totalBytes, err := s.repo.GetStats(ctx, effectiveUserID)
	if err != nil {
		totalItems = len(items)
		totalBytes = 0
	}

	var quotaBytes int64 = 0
	if caller.Role == model.RoleUser {
		quotaBytes = caller.StorageQuotaBytes
	} else if effectiveUserID != nil && s.userRepo != nil {
		u, err := s.userRepo.GetByID(ctx, *effectiveUserID)
		if err == nil && u != nil {
			quotaBytes = u.StorageQuotaBytes
		}
	}

	return &model.DriveListResponse{
		Items:             items,
		CurrentFolder:     currentFolder,
		Breadcrumbs:       breadcrumbs,
		TotalItems:        totalItems,
		TotalBytes:        totalBytes,
		StorageQuotaBytes: quotaBytes,
		StorageUsedBytes:  totalBytes,
	}, nil
}

func (s *DriveService) createFolderForOwner(ctx context.Context, caller *model.User, parentID *uuid.UUID, name string, ownerID uuid.UUID) (*model.DriveItem, error) {
	cleanName := strings.TrimSpace(name)
	if cleanName == "" || strings.Contains(cleanName, "/") || strings.Contains(cleanName, "\\") {
		return nil, ErrInvalidItemName
	}

	existing, err := s.repo.FindFolderByName(ctx, ownerID, parentID, cleanName)
	if err == nil && existing != nil {
		return existing, nil
	}

	item := &model.DriveItem{
		ID:        uuid.New(),
		UserID:    ownerID,
		ParentID:  parentID,
		Name:      cleanName,
		Type:      model.DriveItemTypeFolder,
		SizeBytes: 0,
		MimeType:  "application/x-directory",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := s.repo.Create(ctx, item); err != nil {
		return nil, fmt.Errorf("gagal membuat folder: %w", err)
	}

	zero := 0
	item.ItemCount = &zero

	parentStr := "root"
	if parentID != nil {
		parentStr = parentID.String()
	}
	s.LogAudit(ctx, caller.ID, "drive_folder_created", item.ID.String(), map[string]interface{}{
		"name":      cleanName,
		"parent_id": parentStr,
		"owner_id":  ownerID.String(),
	})

	return item, nil
}

func (s *DriveService) CreateFolder(ctx context.Context, caller *model.User, parentID *uuid.UUID, name string) (*model.DriveItem, error) {
	if caller == nil {
		return nil, ErrAccessDenied
	}
	if !caller.CanEdit {
		return nil, ErrPermissionEditDenied
	}

	cleanName := strings.TrimSpace(name)
	if cleanName == "" || strings.Contains(cleanName, "/") || strings.Contains(cleanName, "\\") {
		return nil, ErrInvalidItemName
	}

	ownerID := caller.ID
	if parentID != nil {
		var parent *model.DriveItem
		var err error
		if caller.Role == model.RoleUser {
			parent, err = s.repo.GetByID(ctx, *parentID, caller.ID)
		} else {
			parent, err = s.repo.GetByIDAny(ctx, *parentID)
		}
		if err != nil || parent.Type != model.DriveItemTypeFolder {
			return nil, ErrParentNotFound
		}
		ownerID = parent.UserID
	}

	return s.createFolderForOwner(ctx, caller, parentID, cleanName, ownerID)
}

func (s *DriveService) UploadFile(
	ctx context.Context,
	caller *model.User,
	initialParentID *uuid.UUID,
	relativePath string,
	filename string,
	r io.Reader,
	size int64,
	mimeType string,
) (*model.DriveItem, error) {
	if caller == nil {
		return nil, ErrAccessDenied
	}
	if !caller.CanEdit {
		return nil, ErrPermissionEditDenied
	}

	effectiveParentID := initialParentID
	ownerID := caller.ID
	if initialParentID != nil {
		var parent *model.DriveItem
		var err error
		if caller.Role == model.RoleUser {
			parent, err = s.repo.GetByID(ctx, *initialParentID, caller.ID)
		} else {
			parent, err = s.repo.GetByIDAny(ctx, *initialParentID)
		}
		if err != nil || parent.Type != model.DriveItemTypeFolder {
			return nil, ErrParentNotFound
		}
		ownerID = parent.UserID
	}

	// Check owner storage quota
	if s.userRepo != nil && size > 0 {
		user, err := s.userRepo.GetByID(ctx, ownerID)
		if err == nil && user != nil && user.StorageQuotaBytes > 0 {
			_, usedBytes, _ := s.repo.GetStats(ctx, &ownerID)
			if usedBytes+size > user.StorageQuotaBytes {
				return nil, fmt.Errorf("kapasitas penyimpanan Drive telah melebihi kuota (%s). Sisa ruang tidak mencukupi untuk berkas berukuran %s", formatBytes(user.StorageQuotaBytes), formatBytes(size))
			}
		}
	}

	targetFilename := filename

	// If relativePath has directory components (e.g. "MyFolder/SubFolder/file.txt")
	cleanedRel := filepath.ToSlash(filepath.Clean(relativePath))
	if cleanedRel != "" && cleanedRel != "." && !strings.HasPrefix(cleanedRel, "../") {
		parts := strings.Split(cleanedRel, "/")
		if len(parts) > 1 {
			targetFilename = parts[len(parts)-1]
			// Traverse / create intermediate folders
			for i := 0; i < len(parts)-1; i++ {
				folderName := strings.TrimSpace(parts[i])
				if folderName == "" || folderName == "." {
					continue
				}
				folder, err := s.createFolderForOwner(ctx, caller, effectiveParentID, folderName, ownerID)
				if err != nil {
					return nil, fmt.Errorf("gagal membuat struktur folder %s: %w", folderName, err)
				}
				folderID := folder.ID
				effectiveParentID = &folderID
			}
		}
	}

	cleanFilename := strings.TrimSpace(targetFilename)
	if cleanFilename == "" {
		cleanFilename = "unnamed_file"
	}

	if mimeType == "" || mimeType == "application/octet-stream" {
		ext := filepath.Ext(cleanFilename)
		if detected := mime.TypeByExtension(ext); detected != "" {
			mimeType = detected
		} else {
			mimeType = "application/octet-stream"
		}
	}

	itemID := uuid.New()
	userDir := filepath.Join(s.baseDir, ownerID.String())
	if err := os.MkdirAll(userDir, 0750); err != nil {
		return nil, fmt.Errorf("gagal membuat direktori user: %w", err)
	}

	storagePath := filepath.Join(userDir, itemID.String())
	file, err := os.OpenFile(storagePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		return nil, fmt.Errorf("gagal membuka target berkas: %w", err)
	}

	written, err := io.Copy(file, r)
	_ = file.Close()
	if err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("gagal menulis berkas ke penyimpanan: %w", err)
	}

	if size <= 0 {
		size = written
	}

	item := &model.DriveItem{
		ID:          itemID,
		UserID:      ownerID,
		ParentID:    effectiveParentID,
		Name:        cleanFilename,
		Type:        model.DriveItemTypeFile,
		SizeBytes:   size,
		MimeType:    mimeType,
		StoragePath: storagePath,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := s.repo.Create(ctx, item); err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("gagal mencatat berkas di basis data: %w", err)
	}

	parentStr := "root"
	if effectiveParentID != nil {
		parentStr = effectiveParentID.String()
	}
	s.LogAudit(ctx, caller.ID, "drive_file_uploaded", item.ID.String(), map[string]interface{}{
		"name":       cleanFilename,
		"size_bytes": size,
		"mime_type":  mimeType,
		"parent_id":  parentStr,
		"owner_id":   ownerID.String(),
	})

	return item, nil
}

func (s *DriveService) GetItem(ctx context.Context, caller *model.User, id uuid.UUID) (*model.DriveItem, error) {
	if caller == nil {
		return nil, ErrAccessDenied
	}
	if !caller.CanView {
		return nil, ErrPermissionViewDenied
	}
	if caller.Role == model.RoleUser {
		return s.repo.GetByID(ctx, id, caller.ID)
	}
	return s.repo.GetByIDAny(ctx, id)
}

// DeleteItem moves item to trash quarantine (keeps files on disk for 7 days)
func (s *DriveService) DeleteItem(ctx context.Context, caller *model.User, id uuid.UUID) error {
	if caller == nil {
		return ErrAccessDenied
	}
	if !caller.CanDelete {
		return ErrPermissionDeleteDenied
	}

	var item *model.DriveItem
	var err error
	if caller.Role == model.RoleUser {
		item, err = s.repo.GetByID(ctx, id, caller.ID)
	} else {
		item, err = s.repo.GetByIDAny(ctx, id)
	}
	if err != nil {
		return err
	}

	if err := s.repo.MoveToTrash(ctx, id, item.UserID); err != nil {
		return err
	}

	s.LogAudit(ctx, caller.ID, "drive_item_trashed", id.String(), map[string]interface{}{
		"name":            item.Name,
		"type":            string(item.Type),
		"owner_id":        item.UserID.String(),
		"quarantine_days": 7,
	})
	return nil
}

// ListTrash returns all items in trash quarantine
func (s *DriveService) ListTrash(ctx context.Context, caller *model.User, targetUserID *uuid.UUID) ([]*model.DriveItem, error) {
	if caller == nil {
		return nil, ErrAccessDenied
	}
	if !caller.CanView {
		return nil, ErrPermissionViewDenied
	}
	if caller.Role == model.RoleUser {
		return s.repo.ListTrash(ctx, &caller.ID)
	}
	return s.repo.ListTrash(ctx, targetUserID)
}

// RestoreItem restores a trashed item and its descendants back to active drive
func (s *DriveService) RestoreItem(ctx context.Context, caller *model.User, id uuid.UUID) error {
	if caller == nil {
		return ErrAccessDenied
	}
	if !caller.CanDelete && !caller.CanEdit {
		return ErrPermissionEditDenied
	}

	var item *model.DriveItem
	var err error
	if caller.Role == model.RoleUser {
		item, err = s.repo.GetByID(ctx, id, caller.ID)
	} else {
		item, err = s.repo.GetByIDAny(ctx, id)
	}
	if err != nil {
		return err
	}

	if err := s.repo.RestoreFromTrash(ctx, id, item.UserID); err != nil {
		return err
	}

	s.LogAudit(ctx, caller.ID, "drive_item_restored", id.String(), map[string]interface{}{
		"name":     item.Name,
		"type":     string(item.Type),
		"owner_id": item.UserID.String(),
	})
	return nil
}

// PermanentDeleteItem permanently removes item and its files from disk and database
func (s *DriveService) PermanentDeleteItem(ctx context.Context, caller *model.User, id uuid.UUID) error {
	if caller == nil {
		return ErrAccessDenied
	}
	if !caller.CanDelete {
		return ErrPermissionDeleteDenied
	}

	var item *model.DriveItem
	var err error
	if caller.Role == model.RoleUser {
		item, err = s.repo.GetByID(ctx, id, caller.ID)
	} else {
		item, err = s.repo.GetByIDAny(ctx, id)
	}
	if err != nil {
		return err
	}

	if item.Type == model.DriveItemTypeFolder {
		descendants, err := s.repo.FindDescendants(ctx, id)
		if err == nil {
			for _, desc := range descendants {
				if desc.Type == model.DriveItemTypeFile && desc.StoragePath != "" {
					_ = os.Remove(desc.StoragePath)
				}
			}
		}
	} else if item.StoragePath != "" {
		_ = os.Remove(item.StoragePath)
	}

	if err := s.repo.DeletePermanent(ctx, id, item.UserID); err != nil {
		return err
	}

	s.LogAudit(ctx, caller.ID, "drive_item_permanently_deleted", id.String(), map[string]interface{}{
		"name":     item.Name,
		"type":     item.Type,
		"owner_id": item.UserID.String(),
	})
	return nil
}

// EmptyTrash permanently removes all trashed items
func (s *DriveService) EmptyTrash(ctx context.Context, caller *model.User, targetUserID *uuid.UUID) error {
	if caller == nil {
		return ErrAccessDenied
	}
	if !caller.CanDelete {
		return ErrPermissionDeleteDenied
	}

	var effectiveUserID *uuid.UUID
	if caller.Role == model.RoleUser {
		effectiveUserID = &caller.ID
	} else {
		effectiveUserID = targetUserID
	}

	trashed, err := s.repo.ListTrash(ctx, effectiveUserID)
	if err == nil {
		for _, item := range trashed {
			if item.Type == model.DriveItemTypeFile && item.StoragePath != "" {
				_ = os.Remove(item.StoragePath)
			}
		}
	}
	if err := s.repo.EmptyTrash(ctx, effectiveUserID); err != nil {
		return err
	}
	s.LogAudit(ctx, caller.ID, "drive_trash_emptied", "", map[string]interface{}{
		"items_count": len(trashed),
	})
	return nil
}

// PurgeExpiredTrash is called by daily cron to permanently purge files trashed > 7 days ago
func (s *DriveService) PurgeExpiredTrash(ctx context.Context, olderThan time.Time) error {
	expired, err := s.repo.GetExpiredTrashItems(ctx, olderThan)
	if err == nil {
		for _, item := range expired {
			if item.Type == model.DriveItemTypeFile && item.StoragePath != "" {
				_ = os.Remove(item.StoragePath)
			}
		}
	}
	purgedCount, err := s.repo.PurgeExpiredTrash(ctx, olderThan)
	if err == nil && purgedCount > 0 && s.auditRepo != nil {
		_ = s.auditRepo.Log(ctx, "system", "cron", "system@backupvault", "drive_trash_purged", "drive", "", "127.0.0.1", "cron", map[string]interface{}{
			"purged_count": purgedCount,
		})
	}
	return err
}

func (s *DriveService) RenameItem(ctx context.Context, caller *model.User, id uuid.UUID, newName string) error {
	if caller == nil {
		return ErrAccessDenied
	}
	if !caller.CanEdit {
		return ErrPermissionEditDenied
	}

	cleanName := strings.TrimSpace(newName)
	if cleanName == "" || strings.Contains(cleanName, "/") || strings.Contains(cleanName, "\\") {
		return ErrInvalidItemName
	}

	var item *model.DriveItem
	var err error
	if caller.Role == model.RoleUser {
		item, err = s.repo.GetByID(ctx, id, caller.ID)
	} else {
		item, err = s.repo.GetByIDAny(ctx, id)
	}
	if err != nil {
		return err
	}

	if err := s.repo.Rename(ctx, id, item.UserID, cleanName); err != nil {
		return err
	}

	s.LogAudit(ctx, caller.ID, "drive_item_renamed", id.String(), map[string]interface{}{
		"old_name": item.Name,
		"new_name": cleanName,
		"type":     string(item.Type),
		"owner_id": item.UserID.String(),
	})
	return nil
}

func (s *DriveService) ZipFolder(ctx context.Context, caller *model.User, folderID uuid.UUID, w http.ResponseWriter) error {
	if caller == nil {
		return ErrAccessDenied
	}
	if !caller.CanView {
		return ErrPermissionViewDenied
	}

	var folder *model.DriveItem
	var err error
	if caller.Role == model.RoleUser {
		folder, err = s.repo.GetByID(ctx, folderID, caller.ID)
	} else {
		folder, err = s.repo.GetByIDAny(ctx, folderID)
	}
	if err != nil {
		return err
	}
	if folder.Type != model.DriveItemTypeFolder {
		return errors.New("item bukan folder")
	}

	descendants, err := s.repo.FindDescendants(ctx, folderID)
	if err != nil {
		return err
	}

	// Map item ID to item for path construction
	itemMap := make(map[uuid.UUID]*model.DriveItem)
	for _, d := range descendants {
		itemMap[d.ID] = d
	}

	// Helper to build relative path inside zip
	getPath := func(item *model.DriveItem) string {
		var pathParts []string
		curr := item
		for curr != nil && curr.ID != folderID {
			pathParts = append([]string{curr.Name}, pathParts...)
			if curr.ParentID == nil {
				break
			}
			curr = itemMap[*curr.ParentID]
		}
		return filepath.Join(pathParts...)
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zip"`, folder.Name))
	w.Header().Set("Content-Type", "application/zip")

	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	for _, d := range descendants {
		if d.ID == folderID {
			continue
		}
		relPath := getPath(d)
		if relPath == "" {
			continue
		}

		if d.Type == model.DriveItemTypeFolder {
			// Create folder entry with trailing slash
			_, _ = zipWriter.Create(filepath.ToSlash(relPath) + "/")
		} else {
			fileEntry, err := zipWriter.Create(filepath.ToSlash(relPath))
			if err != nil {
				continue
			}

			if d.StoragePath != "" {
				diskFile, err := os.Open(d.StoragePath)
				if err == nil {
					_, _ = io.Copy(fileEntry, diskFile)
					_ = diskFile.Close()
				}
			}
		}
	}

	return nil
}

func (s *DriveService) MoveItem(ctx context.Context, caller *model.User, id uuid.UUID, targetParentID *uuid.UUID) error {
	if caller == nil {
		return ErrAccessDenied
	}
	if !caller.CanEdit {
		return ErrPermissionEditDenied
	}

	var item *model.DriveItem
	var err error
	if caller.Role == model.RoleUser {
		item, err = s.repo.GetByID(ctx, id, caller.ID)
	} else {
		item, err = s.repo.GetByIDAny(ctx, id)
	}
	if err != nil {
		return err
	}

	if targetParentID != nil {
		if *targetParentID == id {
			return errors.New("tidak dapat memindahkan item ke dalam dirinya sendiri")
		}

		var target *model.DriveItem
		if caller.Role == model.RoleUser {
			target, err = s.repo.GetByID(ctx, *targetParentID, caller.ID)
		} else {
			target, err = s.repo.GetByIDAny(ctx, *targetParentID)
		}
		if err != nil {
			return ErrInvalidDestination
		}
		if target.Type != model.DriveItemTypeFolder {
			return errors.New("target tujuan harus berupa folder")
		}

		if item.Type == model.DriveItemTypeFolder {
			isDescendant, err := s.repo.IsDescendant(ctx, id, *targetParentID)
			if err != nil {
				return err
			}
			if isDescendant {
				return ErrCircularFolderMove
			}
		}
	}

	if err := s.repo.Move(ctx, id, item.UserID, targetParentID); err != nil {
		return err
	}

	targetStr := "root"
	if targetParentID != nil {
		targetStr = targetParentID.String()
	}
	s.LogAudit(ctx, caller.ID, "drive_item_moved", id.String(), map[string]interface{}{
		"name":             item.Name,
		"type":             item.Type,
		"target_parent_id": targetStr,
		"owner_id":         item.UserID.String(),
	})
	return nil
}

func (s *DriveService) ListAllFolders(ctx context.Context, caller *model.User, targetUserID *uuid.UUID) ([]*model.DriveFolderTreeItem, error) {
	if caller == nil {
		return nil, ErrAccessDenied
	}
	if !caller.CanView {
		return nil, ErrPermissionViewDenied
	}
	if caller.Role == model.RoleUser {
		return s.repo.ListAllFolders(ctx, &caller.ID)
	}
	return s.repo.ListAllFolders(ctx, targetUserID)
}

func (s *DriveService) InitUploadSession(ctx context.Context, caller *model.User, req *model.InitUploadRequest) (*model.InitUploadResponse, error) {
	if caller == nil {
		return nil, ErrAccessDenied
	}
	if !caller.CanEdit {
		return nil, ErrPermissionEditDenied
	}

	if req.TotalBytes <= 0 {
		return nil, errors.New("ukuran berkas harus lebih besar dari 0")
	}

	ownerID := caller.ID
	if req.ParentID != nil {
		var parent *model.DriveItem
		var err error
		if caller.Role == model.RoleUser {
			parent, err = s.repo.GetByID(ctx, *req.ParentID, caller.ID)
		} else {
			parent, err = s.repo.GetByIDAny(ctx, *req.ParentID)
		}
		if err == nil && parent != nil {
			ownerID = parent.UserID
		}
	}

	// Check storage quota
	if s.userRepo != nil && req.TotalBytes > 0 {
		user, err := s.userRepo.GetByID(ctx, ownerID)
		if err == nil && user != nil && user.StorageQuotaBytes > 0 {
			_, usedBytes, _ := s.repo.GetStats(ctx, &ownerID)
			if usedBytes+req.TotalBytes > user.StorageQuotaBytes {
				return nil, fmt.Errorf("kapasitas penyimpanan Drive telah melebihi kuota (%s). Sisa ruang tidak mencukupi untuk berkas berukuran %s", formatBytes(user.StorageQuotaBytes), formatBytes(req.TotalBytes))
			}
		}
	}

	chunkSize := req.ChunkSize
	if chunkSize <= 0 {
		chunkSize = 10 * 1024 * 1024 // 10MB default chunk
	}
	if chunkSize < 512*1024 {
		chunkSize = 512 * 1024 // 512KB minimum
	}
	if chunkSize > 64*1024*1024 {
		chunkSize = 64 * 1024 * 1024 // 64MB maximum
	}

	totalChunks := int((req.TotalBytes + int64(chunkSize) - 1) / int64(chunkSize))

	cleanFilename := strings.TrimSpace(req.Filename)
	if cleanFilename == "" {
		cleanFilename = "unnamed_file"
	}

	uploadID := uuid.New()
	tmpDir := filepath.Join(s.baseDir, "tmp", caller.ID.String())
	if err := os.MkdirAll(tmpDir, 0750); err != nil {
		return nil, fmt.Errorf("gagal membuat direktori temporer: %w", err)
	}

	tempPath := filepath.Join(tmpDir, uploadID.String()+".part")
	f, err := os.OpenFile(tempPath, os.O_CREATE|os.O_RDWR|os.O_TRUNC, 0640)
	if err != nil {
		return nil, fmt.Errorf("gagal membuat berkas penampung: %w", err)
	}
	_ = f.Close()

	session := &model.DriveUploadSession{
		ID:             uploadID,
		UserID:         caller.ID,
		ParentID:       req.ParentID,
		Filename:       cleanFilename,
		RelativePath:   req.RelativePath,
		TotalBytes:     req.TotalBytes,
		UploadedBytes:  0,
		ChunkSize:      chunkSize,
		TotalChunks:    totalChunks,
		LastChunkIndex: -1,
		UploadedChunks: []int32{},
		MimeType:       req.MimeType,
		TempPath:       tempPath,
		Status:         model.DriveUploadSessionInProgress,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if err := s.repo.CreateUploadSession(ctx, session); err != nil {
		_ = os.Remove(tempPath)
		return nil, fmt.Errorf("gagal membuat sesi upload: %w", err)
	}

	return &model.InitUploadResponse{
		UploadID:       uploadID,
		TotalChunks:    totalChunks,
		ChunkSize:      chunkSize,
		UploadedBytes:  0,
		LastChunkIndex: -1,
		UploadedChunks: []int32{},
	}, nil
}

func (s *DriveService) SaveChunk(ctx context.Context, caller *model.User, uploadID uuid.UUID, chunkIndex int, r io.Reader) (int64, error) {
	if caller == nil {
		return 0, ErrAccessDenied
	}
	if !caller.CanEdit {
		return 0, ErrPermissionEditDenied
	}

	session, err := s.repo.GetUploadSession(ctx, uploadID, caller.ID)
	if err != nil {
		return 0, err
	}
	if session.Status != model.DriveUploadSessionInProgress {
		return 0, errors.New("sesi upload sudah tidak aktif")
	}
	if chunkIndex < 0 || chunkIndex >= session.TotalChunks {
		return 0, fmt.Errorf("indeks chunk %d di luar batas (total: %d)", chunkIndex, session.TotalChunks)
	}

	f, err := os.OpenFile(session.TempPath, os.O_WRONLY, 0640)
	if err != nil {
		return 0, fmt.Errorf("gagal membuka berkas sementara: %w", err)
	}
	defer f.Close()

	offset := int64(chunkIndex) * int64(session.ChunkSize)
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return 0, fmt.Errorf("gagal mengatur offset berkas: %w", err)
	}

	written, err := io.Copy(f, r)
	if err != nil {
		return 0, fmt.Errorf("gagal menulis chunk berkas: %w", err)
	}

	newUploadedBytes, err := s.repo.RecordChunkSuccess(ctx, uploadID, caller.ID, chunkIndex, written)
	if err != nil {
		return 0, err
	}

	return newUploadedBytes, nil
}

func (s *DriveService) CompleteUploadSession(ctx context.Context, caller *model.User, uploadID uuid.UUID) (*model.DriveItem, error) {
	if caller == nil {
		return nil, ErrAccessDenied
	}
	if !caller.CanEdit {
		return nil, ErrPermissionEditDenied
	}

	session, err := s.repo.GetUploadSession(ctx, uploadID, caller.ID)
	if err != nil {
		return nil, err
	}
	if session.Status != model.DriveUploadSessionInProgress {
		return nil, errors.New("sesi upload sudah tidak aktif")
	}

	if len(session.UploadedChunks) < session.TotalChunks {
		return nil, fmt.Errorf("masih ada bagian berkas yang belum selesai diunggah (%d/%d bagian)", len(session.UploadedChunks), session.TotalChunks)
	}

	stat, err := os.Stat(session.TempPath)
	if err != nil {
		return nil, fmt.Errorf("berkas sementara tidak ditemukan: %w", err)
	}

	effectiveParentID := session.ParentID
	ownerID := caller.ID
	if session.ParentID != nil {
		var parent *model.DriveItem
		var err error
		if caller.Role == model.RoleUser {
			parent, err = s.repo.GetByID(ctx, *session.ParentID, caller.ID)
		} else {
			parent, err = s.repo.GetByIDAny(ctx, *session.ParentID)
		}
		if err == nil && parent != nil {
			ownerID = parent.UserID
		}
	}

	targetFilename := session.Filename

	cleanedRel := filepath.ToSlash(filepath.Clean(session.RelativePath))
	if cleanedRel != "" && cleanedRel != "." && !strings.HasPrefix(cleanedRel, "../") {
		parts := strings.Split(cleanedRel, "/")
		if len(parts) > 1 {
			targetFilename = parts[len(parts)-1]
			for i := 0; i < len(parts)-1; i++ {
				folderName := strings.TrimSpace(parts[i])
				if folderName == "" || folderName == "." {
					continue
				}
				folder, err := s.createFolderForOwner(ctx, caller, effectiveParentID, folderName, ownerID)
				if err != nil {
					return nil, fmt.Errorf("gagal membuat struktur folder %s: %w", folderName, err)
				}
				folderID := folder.ID
				effectiveParentID = &folderID
			}
		}
	}

	cleanFilename := strings.TrimSpace(targetFilename)
	if cleanFilename == "" {
		cleanFilename = "unnamed_file"
	}

	mimeType := session.MimeType
	if mimeType == "" || mimeType == "application/octet-stream" {
		ext := filepath.Ext(cleanFilename)
		if detected := mime.TypeByExtension(ext); detected != "" {
			mimeType = detected
		} else {
			mimeType = "application/octet-stream"
		}
	}

	itemID := uuid.New()
	userDir := filepath.Join(s.baseDir, ownerID.String())
	_ = os.MkdirAll(userDir, 0750)

	storagePath := filepath.Join(userDir, itemID.String())

	if err := os.Rename(session.TempPath, storagePath); err != nil {
		src, err := os.Open(session.TempPath)
		if err != nil {
			return nil, fmt.Errorf("gagal membuka berkas sumber: %w", err)
		}
		dst, err := os.OpenFile(storagePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
		if err != nil {
			src.Close()
			return nil, fmt.Errorf("gagal membuka target berkas: %w", err)
		}
		_, copyErr := io.Copy(dst, src)
		src.Close()
		dst.Close()
		if copyErr != nil {
			_ = os.Remove(storagePath)
			return nil, fmt.Errorf("gagal menyalin berkas: %w", copyErr)
		}
		_ = os.Remove(session.TempPath)
	}

	item := &model.DriveItem{
		ID:          itemID,
		UserID:      ownerID,
		ParentID:    effectiveParentID,
		Name:        cleanFilename,
		Type:        model.DriveItemTypeFile,
		SizeBytes:   stat.Size(),
		MimeType:    mimeType,
		StoragePath: storagePath,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := s.repo.Create(ctx, item); err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("gagal mencatat berkas di basis data: %w", err)
	}

	_ = s.repo.SetUploadSessionStatus(ctx, uploadID, caller.ID, model.DriveUploadSessionCompleted)

	parentStr := "root"
	if effectiveParentID != nil {
		parentStr = effectiveParentID.String()
	}
	s.LogAudit(ctx, caller.ID, "drive_file_uploaded", item.ID.String(), map[string]interface{}{
		"name":       cleanFilename,
		"size_bytes": stat.Size(),
		"mime_type":  mimeType,
		"parent_id":  parentStr,
		"method":     "chunked_resumable_upload",
		"owner_id":   ownerID.String(),
	})

	return item, nil
}

func (s *DriveService) GetActiveUploadSessions(ctx context.Context, caller *model.User) ([]*model.DriveUploadSession, error) {
	if caller == nil {
		return nil, ErrAccessDenied
	}
	return s.repo.ListActiveUploadSessions(ctx, caller.ID)
}

func (s *DriveService) AbortUploadSession(ctx context.Context, caller *model.User, uploadID uuid.UUID) error {
	if caller == nil {
		return ErrAccessDenied
	}
	if !caller.CanEdit {
		return ErrPermissionEditDenied
	}
	session, err := s.repo.GetUploadSession(ctx, uploadID, caller.ID)
	if err == nil && session.TempPath != "" {
		_ = os.Remove(session.TempPath)
	}
	return s.repo.SetUploadSessionStatus(ctx, uploadID, caller.ID, model.DriveUploadSessionAborted)
}
